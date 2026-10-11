import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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

  it("does not create a second note when the same post is forwarded again", async () => {
    const harness = await createHarness();
    try {
      const forward = channelForward({
        text: postText,
        publishedAt,
        forwardedAt,
      });
      await harness.inbox.handle(forward);
      const filename = "2026-04-01 00-00 Denis Sexy IT 🤖.md";
      const noteName = "2026-04-01 00-00 Denis Sexy IT 🤖";
      const written = await readFile(path.join(harness.root, filename), "utf8");

      await harness.inbox.handle(forward);

      expect(await readdir(harness.root)).toEqual([filename]);
      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(written);
      expect(harness.replies).toEqual([
        { chatId: 100, text: noteName },
        { chatId: 100, text: `уже сохранено: ${noteName}` },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("detects a hand-written root note with a quoted source and leaves it unchanged", async () => {
    const harness = await createHarness();
    try {
      const noteName = "Старая заметка";
      const filename = `${noteName}.md`;
      const handwritten = `---
categories:
  - "[[Clippings]]"
  - "[[Posts]]"
topics:
  - supply chain
  - telegram
comment: |
  первая строка
  source: https://t.me/denissexy/1
title: "Denis Sexy IT 🤖"
source: "https://t.me/denissexy/11330"
published: 2026-03-31
created: 2026-04-01
---
Старый текст.
source: https://t.me/denissexy/2
`;
      await writeFile(path.join(harness.root, filename), handwritten);

      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );

      expect(await readdir(harness.root)).toEqual([filename]);
      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(handwritten);
      expect(harness.replies).toEqual([{ chatId: 100, text: `уже сохранено: ${noteName}` }]);
    } finally {
      await harness.cleanup();
    }
  });

  it("ignores the same source in a subfolder, a non-note, or a syncthing temp", async () => {
    const harness = await createHarness();
    try {
      const duplicate = `---
source: https://t.me/denissexy/11330
---
вложенная
`;
      await mkdir(path.join(harness.root, "nested"));
      await writeFile(path.join(harness.root, "nested", "old.md"), duplicate);
      await writeFile(path.join(harness.root, "loose.txt"), duplicate);
      await writeFile(path.join(harness.root, ".syncthing.old.md.tmp"), duplicate);
      await writeFile(path.join(harness.root, "no-frontmatter.md"), `source: https://t.me/denissexy/11330\n`);

      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );

      const filename = "2026-04-01 00-00 Denis Sexy IT 🤖.md";
      expect((await readdir(harness.root)).sort()).toEqual(
        [".syncthing.old.md.tmp", "loose.txt", "nested", "no-frontmatter.md", filename].sort(),
      );
      expect(harness.replies).toEqual([
        { chatId: 100, text: "2026-04-01 00-00 Denis Sexy IT 🤖" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("saves a different post from the same channel as a new note", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(
        channelForward({
          text: "первый",
          postId: 11330,
          publishedAt,
          forwardedAt,
        }),
      );
      await harness.inbox.handle(
        channelForward({
          text: "второй",
          postId: 11331,
          publishedAt: Date.UTC(2026, 2, 31, 21, 2, 0) / 1000,
          forwardedAt,
        }),
      );

      expect((await readdir(harness.root)).sort()).toEqual([
        "2026-04-01 00-00 Denis Sexy IT 🤖.md",
        "2026-04-01 00-02 Denis Sexy IT 🤖.md",
      ]);
      const second = await readFile(path.join(harness.root, "2026-04-01 00-02 Denis Sexy IT 🤖.md"), "utf8");
      expect(second).toContain("source: https://t.me/denissexy/11331\n");
      expect(second).toContain("второй\n");
      expect(harness.replies).toEqual([
        { chatId: 100, text: "2026-04-01 00-00 Denis Sexy IT 🤖" },
        { chatId: 100, text: "2026-04-01 00-02 Denis Sexy IT 🤖" },
      ]);
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
