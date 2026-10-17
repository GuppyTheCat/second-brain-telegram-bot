import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Message, MessageEntity } from "grammy/types";
import { describe, expect, it } from "vitest";
import type { Harness } from "./harness.js";
import { createHarness, scriptedMedia } from "./harness.js";
import { savedClipping, summary, wroteJournal } from "./reply-text.js";
import { channelForward, photoMessage, photoSize } from "./messages.js";

const publishedAt = Date.UTC(2026, 2, 31, 21, 0, 0) / 1000;
const forwardedAt = Date.UTC(2026, 3, 1, 22, 15, 0) / 1000;
const laterPublished = Date.UTC(2026, 2, 31, 22, 0, 0) / 1000;
const noteName = "2026-04-01 00-00 Denis Sexy IT 🤖";
const laterNote = "2026-04-01 01-00 Denis Sexy IT 🤖";
const source = "https://t.me/denissexy/10";

function bytes(n: number): Uint8Array {
  return new Uint8Array([n]);
}

function part(input: {
  postId: number;
  fileId: string;
  group?: string;
  caption?: string;
  captionEntities?: MessageEntity[];
  publishedAt?: number;
  forwardedAt?: number;
}): Message {
  return channelForward({
    mediaGroupId: input.group ?? "album",
    postId: input.postId,
    messageId: input.postId,
    caption: input.caption,
    captionEntities: input.captionEntities,
    photo: [photoSize(input.fileId, 800, 600)],
    publishedAt: input.publishedAt ?? publishedAt,
    forwardedAt: input.forwardedAt ?? forwardedAt,
  });
}

async function settle(harness: Harness, ms = 1500): Promise<void> {
  await harness.clock.advance(ms);
  await harness.inbox.idle();
}

describe("inbox albums", () => {
  it("saves three photos as one note after the album window", async () => {
    const media = scriptedMedia({
      a: { bytes: bytes(1) },
      b: { bytes: bytes(2) },
      c: { bytes: bytes(3) },
    });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      for (const fileId of ["a", "b", "c"]) {
        const postId = 10 + ["a", "b", "c"].indexOf(fileId);
        const outcome = await harness.inbox.handle(
          part({ postId, fileId, caption: fileId === "a" ? "три кадра" : undefined }),
        );
        expect(outcome).toEqual({ type: "buffered", messageId: postId, class: "album" });
      }
      await harness.inbox.idle();
      expect(media.calls).toEqual([]);
      expect(harness.replies).toEqual([]);
      expect(harness.outcomes).toEqual([]);
      expect(await readdir(harness.root)).toEqual([]);

      await harness.clock.advance(1499);
      await harness.inbox.idle();
      expect(await readdir(harness.root)).toEqual([]);

      await settle(harness, 1);

      expect(media.calls).toEqual(["a", "b", "c"]);
      expect((await readdir(harness.root)).sort()).toEqual([`${noteName}.md`, "Attachments"].sort());
      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(
        clipping(`три кадра\n\n![[${noteName} 1.jpg]]\n![[${noteName} 2.jpg]]\n![[${noteName} 3.jpg]]`),
      );
      expect(await attachment(harness.root, `${noteName} 1.jpg`)).toEqual(bytes(1));
      expect(await attachment(harness.root, `${noteName} 2.jpg`)).toEqual(bytes(2));
      expect(await attachment(harness.root, `${noteName} 3.jpg`)).toEqual(bytes(3));
      expect((await readdir(path.join(harness.root, "Attachments"))).sort()).toEqual(
        [`${noteName} 1.jpg`, `${noteName} 2.jpg`, `${noteName} 3.jpg`].sort(),
      );
      expect(harness.replies).toEqual([]);
      expect(harness.outcomes).toEqual([{ type: "saved", noteName, messageId: 10, class: "album" }]);
    } finally {
      await harness.cleanup();
    }
  });

  it("uses a caption from a later part and converts that part's entities", async () => {
    const media = scriptedMedia({ a: { bytes: bytes(1) }, b: { bytes: bytes(2) } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(part({ postId: 10, fileId: "a" }));
      await harness.inbox.handle(
        part({
          postId: 11,
          fileId: "b",
          caption: "важно",
          captionEntities: [{ type: "bold", offset: 0, length: 5 }],
        }),
      );
      await settle(harness);

      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(
        clipping(`**важно**\n\n![[${noteName} 1.jpg]]\n![[${noteName} 2.jpg]]`),
      );
      expect(harness.replies).toEqual([]);
    } finally {
      await harness.cleanup();
    }
  });

  it("joins several captions in message id order", async () => {
    const media = scriptedMedia({ late: { bytes: bytes(2) }, early: { bytes: bytes(1) } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(
        part({
          postId: 12,
          fileId: "late",
          caption: "второй",
          captionEntities: [{ type: "bold", offset: 0, length: 6 }],
        }),
      );
      await harness.inbox.handle(part({ postId: 10, fileId: "early", caption: "первый" }));
      await settle(harness);

      expect(media.calls).toEqual(["early", "late"]);
      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(
        clipping(`первый\n\n**второй**\n\n![[${noteName} 1.jpg]]\n![[${noteName} 2.jpg]]`),
      );
      expect(harness.replies).toEqual([]);
    } finally {
      await harness.cleanup();
    }
  });

  it("saves an album with no caption as embeds only", async () => {
    const media = scriptedMedia({ a: { bytes: bytes(1) }, b: { bytes: bytes(2) } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(part({ postId: 10, fileId: "a" }));
      await harness.inbox.handle(part({ postId: 11, fileId: "b" }));
      await settle(harness);

      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(
        clipping(`![[${noteName} 1.jpg]]\n![[${noteName} 2.jpg]]`),
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("sorts parts by forward message id and takes the link from the first", async () => {
    const media = scriptedMedia({
      p30: { bytes: bytes(30) },
      p10: { bytes: bytes(10) },
      p20: { bytes: bytes(20) },
    });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(
        part({
          postId: 30,
          fileId: "p30",
          publishedAt: laterPublished,
          forwardedAt: Date.UTC(2026, 3, 2, 22, 15, 0) / 1000,
        }),
      );
      await harness.inbox.handle(part({ postId: 10, fileId: "p10", caption: "порядок" }));
      await harness.inbox.handle(part({ postId: 20, fileId: "p20" }));
      await settle(harness);

      expect(media.calls).toEqual(["p10", "p20", "p30"]);
      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(
        clipping(
          `порядок\n\n![[${noteName} 1.jpg]]\n![[${noteName} 2.jpg]]\n![[${noteName} 3.jpg]]`,
        ),
      );
      expect(await attachment(harness.root, `${noteName} 1.jpg`)).toEqual(bytes(10));
      expect(await attachment(harness.root, `${noteName} 2.jpg`)).toEqual(bytes(20));
      expect(await attachment(harness.root, `${noteName} 3.jpg`)).toEqual(bytes(30));
      expect(await readdir(harness.root)).not.toContain(`${laterNote}.md`);
      expect(harness.replies).toEqual([]);
    } finally {
      await harness.cleanup();
    }
  });

  it("embeds the parts that downloaded and names the one that failed", async () => {
    const media = scriptedMedia({
      a: { bytes: bytes(1) },
      b: { reason: "failed" },
      c: { bytes: bytes(3) },
    });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(part({ postId: 10, fileId: "a" }));
      await harness.inbox.handle(part({ postId: 11, fileId: "b" }));
      await harness.inbox.handle(part({ postId: 12, fileId: "c" }));
      await settle(harness);

      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(
        clipping(
          `![[${noteName} 1.jpg]]\nМедиа не скачано (ошибка загрузки): ${source}\n![[${noteName} 3.jpg]]`,
        ),
      );
      expect((await readdir(path.join(harness.root, "Attachments"))).sort()).toEqual(
        [`${noteName} 1.jpg`, `${noteName} 3.jpg`].sort(),
      );
      await harness.clock.advance(3000);
      await harness.inbox.idle();
      expect(harness.replies).toEqual([
        {
          chatId: 100,
          messageId: 10,
          text: summary(
            wroteJournal("2026-04-02 01:15", "2026-04-02"),
            savedClipping(noteName, "не скачано: 1 из 3 (ошибка загрузки)"),
          ),
        },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("lists differing media failures in one reply", async () => {
    const media = scriptedMedia({
      a: { bytes: bytes(1) },
      b: { reason: "failed" },
      c: { reason: "too_large" },
    });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(part({ postId: 10, fileId: "a" }));
      await harness.inbox.handle(part({ postId: 11, fileId: "b" }));
      await harness.inbox.handle(part({ postId: 12, fileId: "c" }));
      await settle(harness);

      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toContain(
        `![[${noteName} 1.jpg]]\nМедиа не скачано (ошибка загрузки): ${source}\nМедиа не скачано (файл больше 20 МБ): ${source}\n`,
      );
      await harness.clock.advance(3000);
      await harness.inbox.idle();
      expect(harness.replies).toEqual([
        {
          chatId: 100,
          messageId: 10,
          text: summary(
            wroteJournal("2026-04-02 01:15", "2026-04-02"),
            savedClipping(noteName, "не скачано: 2 из 3 (файл больше 20 МБ, ошибка загрузки)"),
          ),
        },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("does not download or create a note for a duplicate album", async () => {
    const media = scriptedMedia({ a: { bytes: bytes(1) }, b: { bytes: bytes(2) }, c: { bytes: bytes(3) } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      const parts = [
        part({ postId: 10, fileId: "a", caption: "три кадра" }),
        part({ postId: 11, fileId: "b" }),
        part({ postId: 12, fileId: "c" }),
      ];
      for (const message of parts) await harness.inbox.handle(message);
      await settle(harness);
      const written = await readFile(path.join(harness.root, `${noteName}.md`), "utf8");

      for (const message of parts) await harness.inbox.handle(message);
      await settle(harness);

      expect(media.calls).toEqual(["a", "b", "c"]);
      expect(await readdir(path.join(harness.root, "Attachments"))).toHaveLength(3);
      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(written);
      expect(harness.replies).toEqual([]);
      expect(harness.outcomes).toEqual([
        { type: "saved", noteName, messageId: 10, class: "album" },
        { type: "duplicate", noteName, messageId: 10, class: "album" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("does not change a clipping when a duplicate album is forwarded", async () => {
    const media = scriptedMedia({ a: { bytes: bytes(1) }, b: { bytes: bytes(2) } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      const parts = [
        part({ postId: 10, fileId: "a", caption: "пост" }),
        part({ postId: 11, fileId: "b" }),
      ];
      for (const message of parts) await harness.inbox.handle(message);
      await settle(harness);
      const written = await readFile(path.join(harness.root, `${noteName}.md`), "utf8");

      for (const message of parts) await harness.inbox.handle(message);
      await settle(harness);

      expect(media.calls).toEqual(["a", "b"]);
      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(written);
      expect(written).not.toContain("comment:");
      expect(harness.replies).toEqual([]);
    } finally {
      await harness.cleanup();
    }
  });

  it("saves two albums that arrive one after another as two notes", async () => {
    const media = scriptedMedia({
      a1: { bytes: bytes(1) },
      a2: { bytes: bytes(2) },
      b1: { bytes: bytes(3) },
      b2: { bytes: bytes(4) },
    });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(part({ postId: 10, fileId: "a1", group: "a", caption: "альбом а" }));
      await harness.inbox.handle(part({ postId: 11, fileId: "a2", group: "a" }));
      await settle(harness);
      await harness.inbox.handle(
        part({ postId: 20, fileId: "b1", group: "b", caption: "альбом б", publishedAt: laterPublished }),
      );
      await harness.inbox.handle(part({ postId: 21, fileId: "b2", group: "b", publishedAt: laterPublished }));
      await settle(harness);

      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(
        clipping(`альбом а\n\n![[${noteName} 1.jpg]]\n![[${noteName} 2.jpg]]`),
      );
      expect(await readFile(path.join(harness.root, `${laterNote}.md`), "utf8")).toBe(
        clipping(`альбом б\n\n![[${laterNote} 1.jpg]]\n![[${laterNote} 2.jpg]]`, {
          source: "https://t.me/denissexy/20",
        }),
      );
      expect(harness.replies).toEqual([]);
    } finally {
      await harness.cleanup();
    }
  });

  it("saves interleaved albums as two notes", async () => {
    const media = scriptedMedia({
      a1: { bytes: bytes(1) },
      a2: { bytes: bytes(2) },
      b1: { bytes: bytes(3) },
      b2: { bytes: bytes(4) },
    });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(part({ postId: 10, fileId: "a1", group: "a", caption: "альбом а" }));
      await harness.inbox.handle(
        part({ postId: 20, fileId: "b1", group: "b", caption: "альбом б", publishedAt: laterPublished }),
      );
      await harness.inbox.handle(part({ postId: 11, fileId: "a2", group: "a" }));
      await harness.inbox.handle(part({ postId: 21, fileId: "b2", group: "b", publishedAt: laterPublished }));
      await settle(harness);

      expect(await attachment(harness.root, `${noteName} 1.jpg`)).toEqual(bytes(1));
      expect(await attachment(harness.root, `${noteName} 2.jpg`)).toEqual(bytes(2));
      expect(await attachment(harness.root, `${laterNote} 1.jpg`)).toEqual(bytes(3));
      expect(await attachment(harness.root, `${laterNote} 2.jpg`)).toEqual(bytes(4));
      expect(harness.replies).toEqual([]);
    } finally {
      await harness.cleanup();
    }
  });

  it("saves a plain forward while an album is still buffered", async () => {
    const media = scriptedMedia({ a: { bytes: bytes(1) }, b: { bytes: bytes(2) } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(part({ postId: 10, fileId: "a", caption: "альбом" }));
      await harness.inbox.handle(
        channelForward({ text: "мимо", postId: 40, publishedAt: laterPublished, forwardedAt }),
      );
      expect((await readdir(harness.root)).sort()).toEqual([`${laterNote}.md`]);
      expect(harness.replies).toEqual([]);

      await harness.inbox.handle(part({ postId: 11, fileId: "b" }));
      await settle(harness);

      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toContain("альбом");
      expect(harness.replies).toEqual([]);
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects a user-sent album one message at a time", async () => {
    const media = scriptedMedia({});
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle({ ...photoMessage(), media_group_id: "local", message_id: 6 });
      await harness.inbox.handle({
        ...photoMessage(),
        media_group_id: "local",
        message_id: 7,
        photo: [photoSize("other", 10, 10)],
      });
      expect(media.calls).toEqual([]);
      expect(harness.replies).toEqual([
        { chatId: 100, messageId: 6, text: "Своё медиа не сохраняю. Принимаю обычный текст и посты каналов." },
        { chatId: 100, messageId: 7, text: "Своё медиа не сохраняю. Принимаю обычный текст и посты каналов." },
      ]);

      await settle(harness);
      expect(await readdir(harness.root)).toEqual([]);
      expect(harness.replies).toHaveLength(2);
    } finally {
      await harness.cleanup();
    }
  });
});

function clipping(body: string, options?: { source?: string }): string {
  const normalized = body.endsWith("\n") ? body : `${body}\n`;
  return `---
categories:
  - "[[Clippings]]"
  - "[[Posts]]"
title: Denis Sexy IT 🤖
telegram: "[denissexy](https://t.me/denissexy)"
source: ${options?.source ?? source}
published: 2026-04-01
created: 2026-04-02
---
${normalized}`;
}

async function attachment(root: string, filename: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(root, "Attachments", filename)));
}
