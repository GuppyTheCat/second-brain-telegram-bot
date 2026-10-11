import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createHarness } from "./harness.js";
import {
  channelForward,
  chatForward,
  hiddenUserForward,
  photoMessage,
  plainText,
  stickerMessage,
  userForward,
} from "./messages.js";

const publishedAt = Date.UTC(2026, 2, 31, 21, 0, 0) / 1000;
const forwardedAt = Date.UTC(2026, 3, 1, 22, 15, 0) / 1000;
const postText = "Участились supply chain атаки – обновляйте зависимости";

describe("inbox", () => {
  it("saves a public channel text post in the vault timezone", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(
        channelForward({
          text: postText,
          entities: [{ type: "bold", offset: 0, length: 11 }],
          channelTitle: "Denis Sexy IT 🤖",
          username: "denissexy",
          postId: 11330,
          publishedAt,
          forwardedAt,
        }),
      );
      await harness.inbox.idle();

      const filename = "2026-04-01 00-00 Denis Sexy IT 🤖.md";
      expect(await readdir(harness.root)).toEqual([filename]);
      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(`---
categories:
  - "[[Clippings]]"
  - "[[Posts]]"
title: Denis Sexy IT 🤖
telegram: "[denissexy](https://t.me/denissexy)"
source: https://t.me/denissexy/11330
published: 2026-04-01
created: 2026-04-02
---
${postText}
`);
      expect(harness.replies).toEqual([
        { chatId: 100, text: "2026-04-01 00-00 Denis Sexy IT 🤖" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("quotes a channel title that YAML would misread", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(
        channelForward({
          text: "hello",
          channelTitle: "Release: Notes",
          username: "releases",
          postId: 5,
          publishedAt: Date.UTC(2026, 3, 1, 10, 0, 0) / 1000,
          forwardedAt: Date.UTC(2026, 3, 1, 10, 5, 0) / 1000,
        }),
      );

      const filename = "2026-04-01 13-00 Release: Notes.md";
      expect(await readFile(path.join(harness.root, filename), "utf8")).toContain(
        'title: "Release: Notes"\n',
      );
      expect(harness.replies).toEqual([{ chatId: 100, text: "2026-04-01 13-00 Release: Notes" }]);
    } finally {
      await harness.cleanup();
    }
  });

  it.each([
    ["user forward", userForward],
    ["hidden user forward", hiddenUserForward],
    ["group forward", chatForward],
    ["sticker", stickerMessage],
    ["non-forwarded photo", photoMessage],
    ["plain text", plainText],
  ])("%s is unsupported and writes nothing", async (_label, build) => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(build());
      expect(harness.replies).toEqual([{ chatId: 100, text: "не поддерживается" }]);
      expect(await readdir(harness.root)).toEqual([]);
    } finally {
      await harness.cleanup();
    }
  });

  it("leaves no syncthing temp file after an atomic write", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(
        channelForward({
          text: "atomic",
          publishedAt,
          forwardedAt,
        }),
      );
      const names = await readdir(harness.root);
      expect(names).toEqual(["2026-04-01 00-00 Denis Sexy IT 🤖.md"]);
      expect(names.some((name) => name.startsWith(".syncthing.") || name.endsWith(".tmp"))).toBe(false);
      const content = await readFile(path.join(harness.root, names[0] ?? ""), "utf8");
      expect(content.endsWith("atomic\n")).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });
});
