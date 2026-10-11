import type { Message } from "grammy/types";
import type { Clock } from "./clock.js";
import type { MediaFetcher } from "./media.js";
import { renderClipping } from "./render-note.js";
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
      const rendered = renderClipping({
        title: origin.chat.title,
        username: origin.chat.username,
        channelId: origin.chat.id,
        postId: origin.message_id,
        publishedUnix: origin.date,
        createdUnix: message.date,
        text: message.text ?? "",
        timezone: deps.config.timezone,
        comment,
      });
      const existing = await deps.vault.findBySource(rendered.source);
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
      await deps.vault.createNote(rendered.filename, rendered.content);
      await deps.reply.reply(message.chat.id, rendered.noteName);
      return { type: "saved", noteName: rendered.noteName };
    }

    if (origin === undefined && typeof message.text === "string") {
      return acceptComment(message);
    }

    await deps.reply.reply(message.chat.id, UNSUPPORTED);
    return { type: "unsupported" };
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
