import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ManualClock } from "../src/clock.js";
import { createInbox, type Inbox, type InboxOutcome } from "../src/inbox.js";
import type { MediaFetcher, MediaFetchResult } from "../src/media.js";
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
  outcomes: InboxOutcome[];
  cleanup: () => Promise<void>;
}

export type MediaScript = { bytes: Uint8Array; extension?: string } | { reason: "too_large" | "failed" };

export function scriptedMedia(byFileId: Record<string, MediaScript>): MediaFetcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async fetch(file): Promise<MediaFetchResult> {
      calls.push(file.fileId);
      const script = byFileId[file.fileId];
      if (!script) throw new Error(`unexpected media file: ${file.fileId}`);
      if ("reason" in script) return { ok: false, reason: script.reason };
      return { ok: true, bytes: script.bytes, extension: script.extension };
    },
  };
}

export async function createHarness(timezone = "Europe/Moscow", media?: MediaFetcher): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), "sb-bot-"));
  const replies: RecordedReply[] = [];
  const outcomes: InboxOutcome[] = [];
  const clock = new ManualClock();
  const fetcher: MediaFetcher = media ?? {
    async fetch() {
      throw new Error("media fetcher should not be called");
    },
  };
  const inbox = createInbox({
    vault: createVaultStore(root),
    media: fetcher,
    reply: {
      async reply(chatId, text) {
        replies.push({ chatId, text });
      },
    },
    clock,
    onOutcome(outcome) {
      outcomes.push(outcome);
    },
    config: {
      timezone,
      commentWindowMs: 3000,
      albumWindowMs: 1500,
      attachmentsDir: "Attachments",
    },
  });

  return {
    root,
    inbox,
    clock,
    replies,
    outcomes,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
