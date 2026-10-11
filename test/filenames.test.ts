import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createHarness, scriptedMedia } from "./harness.js";
import { channelForward, photoSize } from "./messages.js";

const publishedAt = Date.UTC(2026, 2, 31, 21, 0, 0) / 1000;
const forwardedAt = Date.UTC(2026, 3, 1, 22, 15, 0) / 1000;
const noteName = "2026-04-01 00-00 Denis Sexy IT 🤖";

describe("private channels and filenames", () => {
  it("saves a private channel post with a t.me/c source", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(
        channelForward({
          text: "секрет",
          channelTitle: "Secret Channel",
          username: null,
          channelId: -1001234567890,
          postId: 11330,
          publishedAt,
          forwardedAt,
        }),
      );

      const filename = "2026-04-01 00-00 Secret Channel.md";
      expect(await readdir(harness.root)).toEqual([filename]);
      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(
        clipping({
          title: "Secret Channel",
          telegram: "Secret Channel",
          source: "https://t.me/c/1234567890/11330",
          body: "секрет",
        }),
      );
      expect(harness.replies).toEqual([{ chatId: 100, text: "2026-04-01 00-00 Secret Channel" }]);
    } finally {
      await harness.cleanup();
    }
  });

  it("detects a duplicate private channel post", async () => {
    const harness = await createHarness();
    try {
      const forward = channelForward({
        text: "секрет",
        channelTitle: "Secret Channel",
        username: null,
        channelId: -1001234567890,
        postId: 11330,
        publishedAt,
        forwardedAt,
      });
      await harness.inbox.handle(forward);
      const filename = "2026-04-01 00-00 Secret Channel.md";
      const written = await readFile(path.join(harness.root, filename), "utf8");

      await harness.inbox.handle(forward);

      expect(await readdir(harness.root)).toEqual([filename]);
      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(written);
      expect(harness.replies).toEqual([
        { chatId: 100, text: "2026-04-01 00-00 Secret Channel" },
        { chatId: 100, text: "уже сохранено: 2026-04-01 00-00 Secret Channel" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("strips a leading minus when the channel id has no -100 prefix", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(
        channelForward({
          text: "старый",
          channelTitle: "Legacy",
          username: null,
          channelId: -42,
          postId: 9,
          publishedAt,
          forwardedAt,
        }),
      );

      expect(await readFile(path.join(harness.root, "2026-04-01 00-00 Legacy.md"), "utf8")).toBe(
        clipping({
          title: "Legacy",
          telegram: "Legacy",
          source: "https://t.me/c/42/9",
          body: "старый",
        }),
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("suffixes notes when the same channel publishes twice in one minute", async () => {
    const harness = await createHarness();
    try {
      for (const [postId, text] of [
        [1, "первый"],
        [2, "второй"],
        [3, "третий"],
      ] as const) {
        await harness.inbox.handle(
          channelForward({ text, postId, publishedAt, forwardedAt }),
        );
      }

      const names = [noteName, `${noteName} 2`, `${noteName} 3`];
      expect((await readdir(harness.root)).sort()).toEqual(names.map((name) => `${name}.md`).sort());
      for (const [index, name] of names.entries()) {
        const postId = index + 1;
        expect(await readFile(path.join(harness.root, `${name}.md`), "utf8")).toBe(
          clipping({
            title: "Denis Sexy IT 🤖",
            telegram: '"[denissexy](https://t.me/denissexy)"',
            source: `https://t.me/denissexy/${postId}`,
            body: ["первый", "второй", "третий"][index] ?? "",
          }),
        );
      }
      expect(harness.replies).toEqual(names.map((text) => ({ chatId: 100, text })));
    } finally {
      await harness.cleanup();
    }
  });

  it("does not overwrite a hand-written note that already has the filename", async () => {
    const harness = await createHarness();
    try {
      const handwritten = "Hand written note\n";
      await writeFile(path.join(harness.root, `${noteName}.md`), handwritten);

      await harness.inbox.handle(
        channelForward({ text: "новый", postId: 50, publishedAt, forwardedAt }),
      );

      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(handwritten);
      expect(await readFile(path.join(harness.root, `${noteName} 2.md`), "utf8")).toBe(
        clipping({
          title: "Denis Sexy IT 🤖",
          telegram: '"[denissexy](https://t.me/denissexy)"',
          source: "https://t.me/denissexy/50",
          body: "новый",
        }),
      );
      expect(harness.replies).toEqual([{ chatId: 100, text: `${noteName} 2` }]);
    } finally {
      await harness.cleanup();
    }
  });

  it("sanitises the filename and keeps the channel title verbatim", async () => {
    const harness = await createHarness();
    try {
      const title = 'A/B:\u0001C? #[D] | "E" 🤖...';
      await harness.inbox.handle(
        channelForward({
          text: "пост",
          channelTitle: title,
          username: "weird",
          postId: 4,
          publishedAt,
          forwardedAt,
        }),
      );

      const filename = "2026-04-01 00-00 A B C D E 🤖.md";
      expect(await readdir(harness.root)).toEqual([filename]);
      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(
        clipping({
          title: '"A/B:\u0001C? #[D] | \\"E\\" 🤖..."',
          telegram: '"[weird](https://t.me/weird)"',
          source: "https://t.me/weird/4",
          body: "пост",
        }),
      );
      expect(harness.replies).toEqual([{ chatId: 100, text: "2026-04-01 00-00 A B C D E 🤖" }]);
    } finally {
      await harness.cleanup();
    }
  });

  it("falls back when the channel title has no filename-safe characters", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(
        channelForward({
          text: "пусто",
          channelTitle: "*?<>|",
          username: null,
          channelId: -1001234567890,
          postId: 8,
          publishedAt,
          forwardedAt,
        }),
      );

      const filename = "2026-04-01 00-00 Telegram.md";
      expect(await readdir(harness.root)).toEqual([filename]);
      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(
        clipping({
          title: '"*?<>|"',
          telegram: '"*?<>|"',
          source: "https://t.me/c/1234567890/8",
          body: "пусто",
        }),
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("truncates a very long channel title in the filename only", async () => {
    const harness = await createHarness();
    try {
      const title = `${"a".repeat(179)}🤖and-more`;
      await harness.inbox.handle(
        channelForward({
          text: "длинный",
          channelTitle: title,
          postId: 6,
          publishedAt,
          forwardedAt,
        }),
      );

      const saved = `2026-04-01 00-00 ${"a".repeat(179)}`;
      expect(Buffer.byteLength(`${saved}.md`)).toBeLessThanOrEqual(200);
      expect(await readdir(harness.root)).toEqual([`${saved}.md`]);
      expect(await readFile(path.join(harness.root, `${saved}.md`), "utf8")).toBe(
        clipping({
          title,
          telegram: '"[denissexy](https://t.me/denissexy)"',
          source: "https://t.me/denissexy/6",
          body: "длинный",
        }),
      );
      expect(harness.replies).toEqual([{ chatId: 100, text: saved }]);
    } finally {
      await harness.cleanup();
    }
  });

  it("names attachments after the suffixed note", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0x01]);
    const media = scriptedMedia({ pic: { bytes: jpeg } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(channelForward({ text: "текст", postId: 1, publishedAt, forwardedAt }));
      await harness.inbox.handle(
        channelForward({
          caption: "кадр",
          photo: [photoSize("pic", 800, 600)],
          postId: 2,
          publishedAt,
          forwardedAt,
        }),
      );

      const suffixed = `${noteName} 2`;
      expect(await readdir(path.join(harness.root, "Attachments"))).toEqual([`${suffixed} 1.jpg`]);
      expect(new Uint8Array(await readFile(path.join(harness.root, "Attachments", `${suffixed} 1.jpg`)))).toEqual(
        jpeg,
      );
      expect(await readFile(path.join(harness.root, `${suffixed}.md`), "utf8")).toBe(
        clipping({
          title: "Denis Sexy IT 🤖",
          telegram: '"[denissexy](https://t.me/denissexy)"',
          source: "https://t.me/denissexy/2",
          body: `кадр\n\n![[${suffixed} 1.jpg]]`,
        }),
      );
      expect(harness.replies).toEqual([
        { chatId: 100, text: noteName },
        { chatId: 100, text: suffixed },
      ]);
    } finally {
      await harness.cleanup();
    }
  });
});

function clipping(input: { title: string; telegram: string; source: string; body: string }): string {
  const body = input.body.endsWith("\n") ? input.body : `${input.body}\n`;
  return `---
categories:
  - "[[Clippings]]"
  - "[[Posts]]"
title: ${input.title}
telegram: ${input.telegram}
source: ${input.source}
published: 2026-04-01
created: 2026-04-02
---
${body}`;
}
