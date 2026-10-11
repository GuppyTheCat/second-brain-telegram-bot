import type { Message, PhotoSize } from "grammy/types";
import type { Clock } from "./clock.js";
import type { MediaFetcher, MediaFileRef } from "./media.js";
import { renderClipping, type ClippingInput } from "./render-note.js";
import type { ReplySink } from "./reply.js";
import type { VaultStore } from "./vault.js";

export interface InboxConfig {
  timezone: string;
  commentWindowMs: number;
  attachmentsDir: string;
}

export interface InboxDependencies {
  vault: VaultStore;
  media: MediaFetcher;
  reply: ReplySink;
  clock: Clock;
  config: InboxConfig;
}

export type InboxOutcome =
  | { type: "saved"; noteName: string }
  | { type: "duplicate"; noteName: string; comment?: "appended" | "failed" }
  | { type: "comment" }
  | { type: "unsupported" };

export interface Inbox {
  handle(message: Message): Promise<InboxOutcome>;
  /** Resolves when every message and timer task already queued has finished. */
  idle(): Promise<void>;
}

function postBody(message: Message): { text: string; entities?: Message["entities"] } {
  if (typeof message.text === "string") return { text: message.text, entities: message.entities };
  if (typeof message.caption === "string") return { text: message.caption, entities: message.caption_entities };
  return { text: "" };
}

const UNSUPPORTED = "не поддерживается";
const COMMENT_WITHOUT_POST = "комментарий без поста — не сохранил";

interface PendingComment {
  text: string;
  chatId: number;
  attached: boolean;
  generation: number;
  timer: unknown;
}

export function createInbox(deps: InboxDependencies): Inbox {
  let tail: Promise<void> = Promise.resolve();
  let pending: PendingComment | null = null;
  let nextGeneration = 1;

  // Comment-window and album timers must enqueue through here and return that
  // promise from `clock.setTimeout`. ManualClock.advance and idle() then both
  // wait for the work.
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function armCommentWindow(): void {
    if (!pending) return;
    deps.clock.clearTimeout(pending.timer);
    const generation = nextGeneration++;
    pending.generation = generation;
    pending.timer = deps.clock.setTimeout(() => {
      return enqueue(() => expireComment(generation));
    }, deps.config.commentWindowMs);
  }

  async function expireComment(generation: number): Promise<void> {
    if (!pending || pending.generation !== generation) return;
    const expired = pending;
    pending = null;
    if (!expired.attached) {
      await deps.reply.reply(expired.chatId, COMMENT_WITHOUT_POST);
    }
  }

  // Copies the open comment onto this post and restarts the window, so a
  // batch stays covered. Album assembly should attach the same way when the
  // group is saved, and keep the window alive while parts are still arriving.
  function attachPendingComment(): string | undefined {
    if (!pending) return undefined;
    pending.attached = true;
    armCommentWindow();
    return pending.text;
  }

  async function acceptComment(message: Message): Promise<InboxOutcome> {
    const previous = pending;
    pending = {
      text: message.text ?? "",
      chatId: message.chat.id,
      attached: false,
      generation: 0,
      timer: previous?.timer,
    };
    armCommentWindow();
    if (previous && !previous.attached) {
      await deps.reply.reply(previous.chatId, COMMENT_WITHOUT_POST);
    }
    return { type: "comment" };
  }

  async function processMessage(message: Message): Promise<InboxOutcome> {
    const origin = message.forward_origin;
    if (origin?.type === "channel") {
      const comment = attachPendingComment();
      const body = postBody(message);
      const input: ClippingInput = {
        title: origin.chat.title,
        username: origin.chat.username,
        channelId: origin.chat.id,
        postId: origin.message_id,
        publishedUnix: origin.date,
        createdUnix: message.date,
        text: body.text,
        entities: body.entities,
        timezone: deps.config.timezone,
        comment,
      };
      const draft = renderClipping(input);
      const existing = await deps.vault.findBySource(draft.source);
      if (existing) {
        if (comment === undefined) {
          await deps.reply.reply(message.chat.id, `уже сохранено: ${existing.noteName}`);
          return { type: "duplicate", noteName: existing.noteName };
        }
        const appended = await deps.vault.appendComment(existing.filename, comment);
        if (appended === "appended") {
          await deps.reply.reply(
            message.chat.id,
            `уже сохранено: ${existing.noteName}, комментарий добавлен`,
          );
          return { type: "duplicate", noteName: existing.noteName, comment: "appended" };
        }
        await deps.reply.reply(
          message.chat.id,
          `уже сохранено: ${existing.noteName}, комментарий не добавлен`,
        );
        return { type: "duplicate", noteName: existing.noteName, comment: "failed" };
      }
      const downloaded = await downloadMedia(message, draft.noteName, draft.source);
      const rendered =
        downloaded.lines.length === 0 ? draft : renderClipping({ ...input, mediaLines: downloaded.lines });
      try {
        await deps.vault.createNote(rendered.filename, rendered.content);
      } catch (error) {
        if (downloaded.savedAttachment) {
          console.error(`note write failed after saving attachments: ${rendered.filename}`, error);
        }
        throw error;
      }
      await deps.reply.reply(message.chat.id, savedReply(rendered.noteName, downloaded.problems, downloaded.total));
      return { type: "saved", noteName: rendered.noteName };
    }

    if (origin === undefined && typeof message.text === "string") {
      return acceptComment(message);
    }

    await deps.reply.reply(message.chat.id, UNSUPPORTED);
    return { type: "unsupported" };
  }

  async function downloadMedia(
    message: Message,
    noteName: string,
    source: string,
  ): Promise<{ lines: string[]; problems: MediaProblem[]; total: number; savedAttachment: boolean }> {
    const media = extractMedia(message);
    const lines: string[] = [];
    const problems: MediaProblem[] = [];
    let savedAttachment = false;
    for (const [index, item] of media.entries()) {
      const result = await deps.media.fetch(item.ref);
      if (!result.ok) {
        lines.push(mediaFailureLine(result.reason, source));
        problems.push(result.reason);
        continue;
      }
      const filename = `${noteName} ${index + 1}.${extensionFor(item, result.extension)}`;
      const stored = await deps.vault.saveAttachment(deps.config.attachmentsDir, filename, result.bytes);
      savedAttachment = true;
      lines.push(`![[${stored}]]`);
    }
    return { lines, problems, total: media.length, savedAttachment };
  }

  return {
    handle(message) {
      return enqueue(() => processMessage(message));
    },
    idle() {
      return tail;
    },
  };
}

type MediaProblem = "too_large" | "failed";

type MediaKind = "photo" | "video" | "animation" | "document" | "audio" | "voice" | "video_note";

interface IncomingMedia {
  kind: MediaKind;
  ref: MediaFileRef;
}

interface TelegramFileFields {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_name?: string;
  mime_type?: string;
}

const DEFAULT_EXTENSION: Record<MediaKind, string> = {
  photo: "jpg",
  video: "mp4",
  animation: "mp4",
  document: "bin",
  audio: "mp3",
  voice: "ogg",
  video_note: "mp4",
};

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "application/pdf": "pdf",
  "application/zip": "zip",
};

function extractMedia(message: Message): IncomingMedia[] {
  if (message.animation) return [incoming("animation", message.animation)];
  if (message.video) return [incoming("video", message.video)];
  if (message.video_note) return [incoming("video_note", message.video_note)];
  if (message.audio) return [incoming("audio", message.audio)];
  if (message.voice) return [incoming("voice", message.voice)];
  if (message.document) return [incoming("document", message.document)];
  const photo = largestPhoto(message.photo);
  if (photo) return [incoming("photo", photo)];
  return [];
}

function incoming(kind: MediaKind, file: TelegramFileFields): IncomingMedia {
  const ref: MediaFileRef = { fileId: file.file_id, fileUniqueId: file.file_unique_id };
  if (file.file_size !== undefined) ref.fileSize = file.file_size;
  if (file.file_name !== undefined) ref.fileName = file.file_name;
  if (file.mime_type !== undefined) ref.mimeType = file.mime_type;
  return { kind, ref };
}

function largestPhoto(sizes: PhotoSize[] | undefined): PhotoSize | undefined {
  const first = sizes?.[0];
  if (!first || !sizes) return undefined;
  let best = first;
  for (const size of sizes) {
    if (size.width * size.height >= best.width * best.height) best = size;
  }
  return best;
}

function extensionFor(item: IncomingMedia, fetched: string | undefined): string {
  if (item.kind === "document" || item.kind === "audio") {
    const fromName = cleanExtension(extensionOfName(item.ref.fileName));
    if (fromName) return fromName;
  }
  const fromFetcher = cleanExtension(fetched);
  if (fromFetcher) return fromFetcher;
  const fromMime = extensionFromMime(item.ref.mimeType);
  if (fromMime) return fromMime;
  return DEFAULT_EXTENSION[item.kind];
}

function extensionOfName(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined;
  const base = fileName.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return undefined;
  return base.slice(dot + 1);
}

function extensionFromMime(mimeType: string | undefined): string | undefined {
  if (!mimeType) return undefined;
  const mime = mimeType.split(";")[0]?.trim().toLowerCase();
  if (!mime) return undefined;
  const known = MIME_EXTENSION[mime];
  if (known) return known;
  const slash = mime.indexOf("/");
  if (slash === -1) return undefined;
  return cleanExtension(mime.slice(slash + 1));
}

function cleanExtension(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const extension = raw.trim().replace(/^\.+/, "").toLowerCase();
  if (extension === "octet-stream" || !/^[a-z0-9]+$/.test(extension)) return undefined;
  return extension;
}

function mediaFailureLine(reason: MediaProblem, source: string): string {
  const why = reason === "too_large" ? "файл больше 20 МБ" : "ошибка загрузки";
  return `Медиа не скачано (${why}): ${source}`;
}

function savedReply(noteName: string, problems: readonly MediaProblem[], total: number): string {
  if (problems.length === 0 || total === 0) return noteName;
  return `${noteName}\nне скачано: ${problems.length} из ${total} (${problemSummary(problems)})`;
}

function problemSummary(problems: readonly MediaProblem[]): string {
  const tooLarge = problems.includes("too_large");
  const failed = problems.includes("failed");
  if (tooLarge && failed) return "файл больше 20 МБ, ошибка загрузки";
  if (tooLarge) return "файл больше 20 МБ";
  return "ошибка загрузки";
}
