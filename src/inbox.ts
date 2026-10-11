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
  | { type: "duplicate"; noteName: string }
  | { type: "unsupported" };

export interface Inbox {
  handle(message: Message): Promise<InboxOutcome>;
  /** Resolves when every message and timer task already queued has finished. */
  idle(): Promise<void>;
}

const UNSUPPORTED = "не поддерживается";

export function createInbox(deps: InboxDependencies): Inbox {
  let tail: Promise<void> = Promise.resolve();

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

  async function processMessage(message: Message): Promise<InboxOutcome> {
    const origin = message.forward_origin;
    if (origin?.type !== "channel") {
      await deps.reply.reply(message.chat.id, UNSUPPORTED);
      return { type: "unsupported" };
    }

    const rendered = renderClipping({
      title: origin.chat.title,
      username: origin.chat.username,
      channelId: origin.chat.id,
      postId: origin.message_id,
      publishedUnix: origin.date,
      createdUnix: message.date,
      text: message.text ?? "",
      timezone: deps.config.timezone,
    });
    const existing = await deps.vault.findBySource(rendered.source);
    if (existing) {
      await deps.reply.reply(message.chat.id, `уже сохранено: ${existing.noteName}`);
      return { type: "duplicate", noteName: existing.noteName };
    }
    await deps.vault.createNote(rendered.filename, rendered.content);
    await deps.reply.reply(message.chat.id, rendered.noteName);
    return { type: "saved", noteName: rendered.noteName };
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
