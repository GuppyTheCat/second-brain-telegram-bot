import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createHarness, scriptedMedia, type MediaScript } from "./harness.js";
import { channelForward, mediaFile, photoMessage, photoSize, plainText } from "./messages.js";

const publishedAt = Date.UTC(2026, 2, 31, 21, 0, 0) / 1000;
const forwardedAt = Date.UTC(2026, 3, 1, 22, 15, 0) / 1000;
const noteName = "2026-04-01 00-00 Denis Sexy IT 🤖";
const source = "https://t.me/denissexy/11330";

const jpeg = new Uint8Array([0xff, 0xd8, 0x01]);
const other = new Uint8Array([0x00, 0x11]);

describe("inbox media", () => {
  it("saves the largest photo after the caption", async () => {
    const small = new Uint8Array([1]);
    const large = new Uint8Array([2, 2, 2]);
    const medium = new Uint8Array([3]);
    const media = scriptedMedia({
      small: { bytes: small },
      large: { bytes: large },
      medium: { bytes: medium },
    });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(
        channelForward({
          caption: "Участились supply chain атаки",
          photo: [photoSize("small", 100, 80), photoSize("large", 1280, 720), photoSize("medium", 320, 240)],
          publishedAt,
          forwardedAt,
        }),
      );

      expect(media.calls).toEqual(["large"]);
      expect((await readdir(harness.root)).sort()).toEqual([`${noteName}.md`, "Attachments"].sort());
      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(
        clipping(`Участились supply chain атаки\n\n![[${noteName} 1.jpg]]`),
      );
      expect(new Uint8Array(await readFile(attachment(harness.root, `${noteName} 1.jpg`)))).toEqual(large);
      expect(await readdir(path.join(harness.root, "Attachments"))).toEqual([`${noteName} 1.jpg`]);
      expect(harness.replies).toEqual([{ chatId: 100, text: noteName }]);
    } finally {
      await harness.cleanup();
    }
  });

  it("saves a media-only photo as a note whose body is the embed", async () => {
    const media = scriptedMedia({ only: { bytes: jpeg } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(
        channelForward({
          photo: [photoSize("only", 800, 600)],
          publishedAt,
          forwardedAt,
        }),
      );

      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(
        clipping(`![[${noteName} 1.jpg]]`),
      );
      expect(new Uint8Array(await readFile(attachment(harness.root, `${noteName} 1.jpg`)))).toEqual(jpeg);
    } finally {
      await harness.cleanup();
    }
  });

  it("saves a video using the extension reported by the fetcher", async () => {
    await expectSaved({
      scripts: { vid: { bytes: other, extension: "mov" } },
      message: channelForward({
        caption: "ролик",
        video: { ...mediaFile("vid"), width: 320, height: 240, duration: 4, mime_type: "video/mp4" },
        publishedAt,
        forwardedAt,
      }),
      filename: `${noteName} 1.mov`,
      body: `ролик\n\n![[${noteName} 1.mov]]`,
      bytes: other,
    });
  });

  it("saves a document with the extension from its file name", async () => {
    await expectSaved({
      scripts: { doc: { bytes: other, extension: "bin" } },
      message: channelForward({
        caption: "слайды",
        document: { ...mediaFile("doc"), file_name: "brief.pdf", mime_type: "application/pdf" },
        publishedAt,
        forwardedAt,
      }),
      filename: `${noteName} 1.pdf`,
      body: `слайды\n\n![[${noteName} 1.pdf]]`,
      bytes: other,
    });
  });

  it("saves audio with the extension from its file name", async () => {
    await expectSaved({
      scripts: { song: { bytes: other, extension: "mp3" } },
      message: channelForward({
        audio: { ...mediaFile("song"), duration: 90, file_name: "track.flac", mime_type: "audio/mpeg" },
        publishedAt,
        forwardedAt,
      }),
      filename: `${noteName} 1.flac`,
      body: `![[${noteName} 1.flac]]`,
      bytes: other,
    });
  });

  it("saves a voice message with the default extension", async () => {
    await expectSaved({
      scripts: { voice: { bytes: other } },
      message: channelForward({
        voice: { ...mediaFile("voice"), duration: 2 },
        publishedAt,
        forwardedAt,
      }),
      filename: `${noteName} 1.ogg`,
      body: `![[${noteName} 1.ogg]]`,
      bytes: other,
    });
  });

  it("saves a video note with the default extension", async () => {
    await expectSaved({
      scripts: { round: { bytes: other } },
      message: channelForward({
        videoNote: { ...mediaFile("round"), length: 240, duration: 3 },
        publishedAt,
        forwardedAt,
      }),
      filename: `${noteName} 1.mp4`,
      body: `![[${noteName} 1.mp4]]`,
      bytes: other,
    });
  });

  it("saves an animation once and ignores the paired document", async () => {
    const media = scriptedMedia({ anim: { bytes: jpeg } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(
        channelForward({
          animation: { ...mediaFile("anim"), width: 200, height: 100, duration: 2 },
          document: { ...mediaFile("doc"), file_name: "clip.gif", mime_type: "image/gif" },
          publishedAt,
          forwardedAt,
        }),
      );

      expect(media.calls).toEqual(["anim"]);
      expect(await readdir(path.join(harness.root, "Attachments"))).toEqual([`${noteName} 1.mp4`]);
      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(
        clipping(`![[${noteName} 1.mp4]]`),
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("keeps an oversized file out of the vault and mentions it", async () => {
    const media = scriptedMedia({ big: { reason: "too_large" } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(
        channelForward({
          caption: "смотри",
          photo: [photoSize("big", 4000, 3000, 21 * 1024 * 1024)],
          publishedAt,
          forwardedAt,
        }),
      );

      expect(media.calls).toEqual(["big"]);
      expect(await readdir(harness.root)).toEqual([`${noteName}.md`]);
      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(
        clipping(`смотри\n\nМедиа не скачано (файл больше 20 МБ): ${source}`),
      );
      expect(harness.replies).toEqual([
        { chatId: 100, text: `${noteName}\nне скачано: 1 из 1 (файл больше 20 МБ)` },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("keeps a failed download as a note line and mentions it", async () => {
    const media = scriptedMedia({ gone: { reason: "failed" } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(
        channelForward({
          photo: [photoSize("gone", 640, 480)],
          publishedAt,
          forwardedAt,
        }),
      );

      expect(await readdir(harness.root)).toEqual([`${noteName}.md`]);
      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(
        clipping(`Медиа не скачано (ошибка загрузки): ${source}`),
      );
      expect(harness.replies).toEqual([
        { chatId: 100, text: `${noteName}\nне скачано: 1 из 1 (ошибка загрузки)` },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("does not download media when the forward is a duplicate", async () => {
    const media = scriptedMedia({ pic: { bytes: jpeg } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      const forward = channelForward({
        photo: [photoSize("pic", 800, 600)],
        publishedAt,
        forwardedAt,
      });
      await harness.inbox.handle(forward);
      const written = await readFile(path.join(harness.root, `${noteName}.md`), "utf8");

      await harness.inbox.handle(forward);

      expect(media.calls).toEqual(["pic"]);
      expect(await readdir(path.join(harness.root, "Attachments"))).toEqual([`${noteName} 1.jpg`]);
      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(written);
      expect(harness.replies).toEqual([
        { chatId: 100, text: noteName },
        { chatId: 100, text: `уже сохранено: ${noteName}` },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("adds a numeric suffix when the attachment name is taken", async () => {
    const media = scriptedMedia({ pic: { bytes: jpeg } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      const taken = `${noteName} 1.jpg`;
      const folder = path.join(harness.root, "Attachments");
      await mkdir(folder);
      await writeFile(path.join(folder, taken), Buffer.from([9, 9]));
      await writeFile(path.join(folder, `${noteName} 1-2.jpg`), Buffer.from([8, 8]));

      await harness.inbox.handle(
        channelForward({
          photo: [photoSize("pic", 100, 100)],
          publishedAt,
          forwardedAt,
        }),
      );

      expect(new Uint8Array(await readFile(path.join(folder, taken)))).toEqual(new Uint8Array([9, 9]));
      expect(new Uint8Array(await readFile(path.join(folder, `${noteName} 1-2.jpg`)))).toEqual(
        new Uint8Array([8, 8]),
      );
      expect(new Uint8Array(await readFile(path.join(folder, `${noteName} 1-3.jpg`)))).toEqual(jpeg);
      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toContain(
        `![[${noteName} 1-3.jpg]]\n`,
      );
      expect((await readdir(folder)).some((name) => name.startsWith(".syncthing.") || name.endsWith(".tmp"))).toBe(
        false,
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("saves a media clipping without a comment when text arrived first", async () => {
    const media = scriptedMedia({ pic: { bytes: jpeg } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(plainText("к разбору", forwardedAt));
      await harness.inbox.handle(
        channelForward({
          caption: "пост",
          photo: [photoSize("pic", 400, 300)],
          publishedAt,
          forwardedAt,
        }),
      );
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(
        clipping(`пост\n\n![[${noteName} 1.jpg]]`),
      );
      expect(harness.replies).toEqual([
        { chatId: 100, text: noteName },
        { chatId: 100, text: "2026-04-02 01:15" },
      ]);
      const journal = await readFile(path.join(harness.root, "Periodic", "Daily", "2026-04-02.md"), "utf8");
      expect(journal).toContain(`### 01:15\nк разбору\n> [!post]\n> [[${noteName}]]\n`);
    } finally {
      await harness.cleanup();
    }
  });

  it("still rejects a photo that is not a channel forward", async () => {
    const media = scriptedMedia({ "photo-file": { bytes: jpeg } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(photoMessage());
      expect(media.calls).toEqual([]);
      expect(harness.replies).toEqual([{ chatId: 100, text: "не поддерживается" }]);
      expect(await readdir(harness.root)).toEqual([]);
    } finally {
      await harness.cleanup();
    }
  });
});

function attachment(root: string, filename: string): string {
  return path.join(root, "Attachments", filename);
}

function clipping(body: string): string {
  const normalized = body.endsWith("\n") ? body : `${body}\n`;
  return `---
categories:
  - "[[Clippings]]"
  - "[[Posts]]"
title: Denis Sexy IT 🤖
telegram: "[denissexy](https://t.me/denissexy)"
source: ${source}
published: 2026-04-01
created: 2026-04-02
---
${normalized}`;
}

async function expectSaved(input: {
  scripts: Record<string, MediaScript>;
  message: ReturnType<typeof channelForward>;
  filename: string;
  body: string;
  bytes: Uint8Array;
}): Promise<void> {
  const media = scriptedMedia(input.scripts);
  const harness = await createHarness("Europe/Moscow", media);
  try {
    await harness.inbox.handle(input.message);
    expect(await readdir(path.join(harness.root, "Attachments"))).toEqual([input.filename]);
    expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(clipping(input.body));
    expect(new Uint8Array(await readFile(attachment(harness.root, input.filename)))).toEqual(input.bytes);
    expect(harness.replies).toEqual([{ chatId: 100, text: noteName }]);
  } finally {
    await harness.cleanup();
  }
}
