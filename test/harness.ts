import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ManualClock } from "../src/clock.js";
import { createInbox, type Inbox } from "../src/inbox.js";
import type { MediaFetcher } from "../src/media.js";
import { createVaultStore } from "../src/vault.js";

export interface RecordedReply {
  chatId: number;
  text: string;
}

export interface Harness {
  root: string;
  inbox: Inbox;
  clock: ManualClock;
  replies: RecordedReply[];
  cleanup: () => Promise<void>;
}

export async function createHarness(timezone = "Europe/Moscow"): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), "sb-bot-"));
  const replies: RecordedReply[] = [];
  const clock = new ManualClock();
  const media: MediaFetcher = {
    async fetch() {
      throw new Error("media fetcher should not be called in this slice");
    },
  };
  const inbox = createInbox({
    vault: createVaultStore(root),
    media,
    reply: {
      async reply(chatId, text) {
        replies.push({ chatId, text });
      },
    },
    clock,
    config: {
      timezone,
      commentWindowMs: 3000,
      attachmentsDir: "Attachments",
    },
  });

  return {
    root,
    inbox,
    clock,
    replies,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
