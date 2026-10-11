import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MessageEntity } from "grammy/types";
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
**Участились**${postText.slice(10)}
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

  it("saves a comment on the forwarded post", async () => {
    const harness = await createHarness();
    try {
      const comment = "к разбору 🤖";
      await harness.inbox.handle(plainText(comment));
      await harness.inbox.handle(
        channelForward({
          text: postText,
          channelTitle: "Denis Sexy IT 🤖",
          username: "denissexy",
          postId: 11330,
          publishedAt,
          forwardedAt,
        }),
      );
      await harness.clock.advance(3000);
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
comment: ${comment}
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

  it("stores a multi-line comment as a YAML block scalar", async () => {
    const harness = await createHarness();
    try {
      const comment = 'why: this\n- item\nsay "hi"\n# tag\nещё 🤖';
      await harness.inbox.handle(plainText(comment));
      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );

      const filename = "2026-04-01 00-00 Denis Sexy IT 🤖.md";
      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(`---
categories:
  - "[[Clippings]]"
  - "[[Posts]]"
title: Denis Sexy IT 🤖
telegram: "[denissexy](https://t.me/denissexy)"
source: https://t.me/denissexy/11330
published: 2026-04-01
created: 2026-04-02
comment: |-
  why: this
  - item
  say "hi"
  # tag
  ещё 🤖
---
${postText}
`);
    } finally {
      await harness.cleanup();
    }
  });

  it("quotes a single-line comment that YAML would misread", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(plainText('- "keep": this #1 🤖'));
      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );

      const content = await readFile(
        path.join(harness.root, "2026-04-01 00-00 Denis Sexy IT 🤖.md"),
        "utf8",
      );
      expect(content).toContain('created: 2026-04-02\ncomment: "- \\"keep\\": this #1 🤖"\n---\n');
    } finally {
      await harness.cleanup();
    }
  });

  it("applies one comment to a batch whose gaps stay inside the window", async () => {
    const harness = await createHarness();
    try {
      const comment = "к разбору";
      await harness.inbox.handle(plainText(comment));

      await harness.clock.advance(2500);
      await harness.inbox.handle(
        channelForward({
          text: "первый",
          channelTitle: "Denis Sexy IT 🤖",
          username: "denissexy",
          postId: 1,
          publishedAt,
          forwardedAt,
        }),
      );

      await harness.clock.advance(2500);
      await harness.inbox.handle(
        channelForward({
          text: "второй",
          channelTitle: "Other Channel",
          username: "other",
          postId: 2,
          publishedAt,
          forwardedAt,
        }),
      );

      await harness.clock.advance(2500);
      await harness.inbox.handle(
        channelForward({
          text: "третий",
          channelTitle: "Denis Sexy IT 🤖",
          username: "denissexy",
          postId: 3,
          publishedAt: Date.UTC(2026, 2, 31, 21, 5, 0) / 1000,
          forwardedAt,
        }),
      );

      await harness.clock.advance(3000);
      await harness.inbox.idle();

      const files = [
        "2026-04-01 00-00 Denis Sexy IT 🤖.md",
        "2026-04-01 00-00 Other Channel.md",
        "2026-04-01 00-05 Denis Sexy IT 🤖.md",
      ];
      expect((await readdir(harness.root)).sort()).toEqual([...files].sort());
      for (const filename of files) {
        const content = await readFile(path.join(harness.root, filename), "utf8");
        expect(content).toContain(`comment: ${comment}\n`);
      }
      expect(harness.replies).toEqual([
        { chatId: 100, text: "2026-04-01 00-00 Denis Sexy IT 🤖" },
        { chatId: 100, text: "2026-04-01 00-00 Other Channel" },
        { chatId: 100, text: "2026-04-01 00-05 Denis Sexy IT 🤖" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects a comment when no post arrives before the window closes", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(plainText("забыл пост"));
      await harness.clock.advance(2999);
      await harness.inbox.idle();
      expect(harness.replies).toEqual([]);
      expect(await readdir(harness.root)).toEqual([]);

      await harness.clock.advance(1);
      await harness.inbox.idle();
      expect(harness.replies).toEqual([
        { chatId: 100, text: "комментарий без поста — не сохранил" },
      ]);
      expect(await readdir(harness.root)).toEqual([]);
    } finally {
      await harness.cleanup();
    }
  });

  it("replaces a pending comment and rejects the one that never attached", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(plainText("первый"));
      await harness.inbox.handle(plainText("второй"));
      expect(harness.replies).toEqual([
        { chatId: 100, text: "комментарий без поста — не сохранил" },
      ]);

      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      const filename = "2026-04-01 00-00 Denis Sexy IT 🤖.md";
      const content = await readFile(path.join(harness.root, filename), "utf8");
      expect(content).toContain("comment: второй\n");
      expect(content).not.toContain("первый");
      expect(harness.replies).toEqual([
        { chatId: 100, text: "комментарий без поста — не сохранил" },
        { chatId: 100, text: "2026-04-01 00-00 Denis Sexy IT 🤖" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("saves a forward after the comment window with no comment", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(plainText("опоздал"));
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );

      const filename = "2026-04-01 00-00 Denis Sexy IT 🤖.md";
      const content = await readFile(path.join(harness.root, filename), "utf8");
      expect(content).not.toContain("comment:");
      expect(content).toContain("created: 2026-04-02\n---\n");
      expect(harness.replies).toEqual([
        { chatId: 100, text: "комментарий без поста — не сохранил" },
        { chatId: 100, text: "2026-04-01 00-00 Denis Sexy IT 🤖" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("keeps a pending comment across an unsupported sticker", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(plainText("к стикеру"));
      await harness.clock.advance(1000);
      await harness.inbox.handle(stickerMessage());
      await harness.clock.advance(1000);
      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );

      const content = await readFile(
        path.join(harness.root, "2026-04-01 00-00 Denis Sexy IT 🤖.md"),
        "utf8",
      );
      expect(content).toContain("comment: к стикеру\n");
      expect(await readdir(harness.root)).toEqual(["2026-04-01 00-00 Denis Sexy IT 🤖.md"]);
      expect(harness.replies).toEqual([
        { chatId: 100, text: "не поддерживается" },
        { chatId: 100, text: "2026-04-01 00-00 Denis Sexy IT 🤖" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("appends a second comment onto the existing note", async () => {
    const harness = await createHarness();
    try {
      const forward = channelForward({
        text: postText,
        publishedAt,
        forwardedAt,
      });
      const filename = "2026-04-01 00-00 Denis Sexy IT 🤖.md";
      const noteName = "2026-04-01 00-00 Denis Sexy IT 🤖";

      await harness.inbox.handle(plainText("A"));
      await harness.inbox.handle(forward);
      await harness.inbox.handle(plainText("B"));
      await harness.inbox.handle(forward);
      await harness.clock.advance(3000);
      await harness.inbox.idle();

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
comment: |-
  A
  B
---
${postText}
`);
      expect(harness.replies).toEqual([
        { chatId: 100, text: noteName },
        { chatId: 100, text: `уже сохранено: ${noteName}, комментарий добавлен` },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("appends a third multi-line comment under the earlier lines", async () => {
    const harness = await createHarness();
    try {
      const forward = channelForward({
        text: postText,
        publishedAt,
        forwardedAt,
      });
      const filename = "2026-04-01 00-00 Denis Sexy IT 🤖.md";

      await harness.inbox.handle(plainText("A"));
      await harness.inbox.handle(forward);
      await harness.inbox.handle(plainText("B"));
      await harness.inbox.handle(forward);
      await harness.inbox.handle(plainText("C1\nC2"));
      await harness.inbox.handle(forward);

      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(`---
categories:
  - "[[Clippings]]"
  - "[[Posts]]"
title: Denis Sexy IT 🤖
telegram: "[denissexy](https://t.me/denissexy)"
source: https://t.me/denissexy/11330
published: 2026-04-01
created: 2026-04-02
comment: |-
  A
  B
  C1
  C2
---
${postText}
`);
    } finally {
      await harness.cleanup();
    }
  });

  it("creates comment as the last key when the saved note had none", async () => {
    const harness = await createHarness();
    try {
      const forward = channelForward({
        text: postText,
        publishedAt,
        forwardedAt,
      });
      const filename = "2026-04-01 00-00 Denis Sexy IT 🤖.md";
      const noteName = "2026-04-01 00-00 Denis Sexy IT 🤖";
      await harness.inbox.handle(forward);

      await harness.inbox.handle(plainText("к разбору"));
      await harness.inbox.handle(forward);

      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(`---
categories:
  - "[[Clippings]]"
  - "[[Posts]]"
title: Denis Sexy IT 🤖
telegram: "[denissexy](https://t.me/denissexy)"
source: https://t.me/denissexy/11330
published: 2026-04-01
created: 2026-04-02
comment: к разбору
---
${postText}
`);
      expect(harness.replies).toEqual([
        { chatId: 100, text: noteName },
        { chatId: 100, text: `уже сохранено: ${noteName}, комментарий добавлен` },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("replaces only a quoted comment on a hand-written note", async () => {
    const harness = await createHarness();
    try {
      const noteName = "Старая заметка";
      const filename = `${noteName}.md`;
      const handwritten = `---
categories:
  - "[[Clippings]]"
  - "[[Posts]]"
author:
  - "[[Denis Sexy IT]]"
topics:
  - supply chain
  - telegram
comment: "old: value"
title: "Denis Sexy IT 🤖"
source: "https://t.me/denissexy/11330"
published: 2026-03-31
created: 2026-04-01
---
Старый текст.
ещё строка.
`;
      await writeFile(path.join(harness.root, filename), handwritten);

      await harness.inbox.handle(plainText("новая мысль"));
      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );

      const commentLine = 'comment: "old: value"\n';
      const at = handwritten.indexOf(commentLine);
      const expected =
        handwritten.slice(0, at) +
        "comment: |-\n  old: value\n  новая мысль\n" +
        handwritten.slice(at + commentLine.length);
      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(expected);
      expect(harness.replies).toEqual([
        { chatId: 100, text: `уже сохранено: ${noteName}, комментарий добавлен` },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("appends a third line to a literal block and keeps the keys after it", async () => {
    const harness = await createHarness();
    try {
      const filename = "Старая заметка.md";
      const handwritten = `---
categories:
  - "[[Clippings]]"
  - "[[Posts]]"
source: https://t.me/denissexy/11330
comment: |
  первая
  вторая
topics:
  - kept
author: "[[Someone]]"
---
тело
`;
      await writeFile(path.join(harness.root, filename), handwritten);

      await harness.inbox.handle(plainText("третья"));
      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );

      const commentBlock = "comment: |\n  первая\n  вторая\n";
      const at = handwritten.indexOf(commentBlock);
      const expected =
        handwritten.slice(0, at) +
        "comment: |-\n  первая\n  вторая\n  третья\n" +
        handwritten.slice(at + commentBlock.length);
      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(expected);
    } finally {
      await harness.cleanup();
    }
  });

  it("keeps a leading space with an explicit block indent", async () => {
    const harness = await createHarness();
    try {
      const filename = "Старая заметка.md";
      const handwritten = `---
source: https://t.me/denissexy/11330
comment: " leading"
---
body
`;
      await writeFile(path.join(harness.root, filename), handwritten);

      await harness.inbox.handle(plainText("next"));
      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );

      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(`---
source: https://t.me/denissexy/11330
comment: |2-
   leading
  next
---
body
`);
    } finally {
      await harness.cleanup();
    }
  });

  it("keeps an empty comment line when appending", async () => {
    const harness = await createHarness();
    try {
      const filename = "Старая заметка.md";
      const handwritten = `---
source: https://t.me/denissexy/11330
comment: |-
  A

  B
---
body
`;
      await writeFile(path.join(harness.root, filename), handwritten);

      await harness.inbox.handle(plainText("C"));
      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );

      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(`---
source: https://t.me/denissexy/11330
comment: |-
  A
  
  B
  C
---
body
`);
    } finally {
      await harness.cleanup();
    }
  });

  it("folds a > block before appending and keeps the following key", async () => {
    const harness = await createHarness();
    try {
      const filename = "Старая заметка.md";
      const handwritten = `---
source: https://t.me/denissexy/11330
comment: >
  foo
  bar
topics:
  - kept
---
body
`;
      await writeFile(path.join(harness.root, filename), handwritten);

      await harness.inbox.handle(plainText("baz"));
      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );

      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(`---
source: https://t.me/denissexy/11330
comment: |-
  foo bar
  baz
topics:
  - kept
---
body
`);
    } finally {
      await harness.cleanup();
    }
  });

  it("applies one comment to a new note and an already-saved note", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(
        channelForward({
          text: "первый",
          postId: 1,
          publishedAt,
          forwardedAt,
        }),
      );
      await harness.inbox.handle(plainText("к разбору"));
      await harness.inbox.handle(
        channelForward({
          text: "первый",
          postId: 1,
          publishedAt,
          forwardedAt,
        }),
      );
      await harness.inbox.handle(
        channelForward({
          text: "второй",
          channelTitle: "Other Channel",
          username: "other",
          postId: 2,
          publishedAt,
          forwardedAt,
        }),
      );
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      const existing = "2026-04-01 00-00 Denis Sexy IT 🤖.md";
      const created = "2026-04-01 00-00 Other Channel.md";
      expect((await readdir(harness.root)).sort()).toEqual([existing, created]);
      expect(await readFile(path.join(harness.root, existing), "utf8")).toContain(
        "created: 2026-04-02\ncomment: к разбору\n---\nпервый\n",
      );
      const other = await readFile(path.join(harness.root, created), "utf8");
      expect(other).toContain("comment: к разбору\n");
      expect(other).toContain("второй\n");
      expect(harness.replies).toEqual([
        { chatId: 100, text: "2026-04-01 00-00 Denis Sexy IT 🤖" },
        {
          chatId: 100,
          text: "уже сохранено: 2026-04-01 00-00 Denis Sexy IT 🤖, комментарий добавлен",
        },
        { chatId: 100, text: "2026-04-01 00-00 Other Channel" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("leaves a note untouched when the frontmatter never closes", async () => {
    const harness = await createHarness();
    try {
      const noteName = "Старая заметка";
      const filename = `${noteName}.md`;
      const handwritten = `---
source: https://t.me/denissexy/11330
comment: keep
тело без закрытия
`;
      await writeFile(path.join(harness.root, filename), handwritten);

      await harness.inbox.handle(plainText("нельзя"));
      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );

      expect(await readdir(harness.root)).toEqual([filename]);
      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(handwritten);
      expect(harness.replies).toEqual([
        { chatId: 100, text: `уже сохранено: ${noteName}, комментарий не добавлен` },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("appends to a CRLF note without rewriting the other lines", async () => {
    const harness = await createHarness();
    try {
      const filename = "Старая заметка.md";
      const nl = "\r\n";
      const handwritten = [
        "---",
        "source: https://t.me/denissexy/11330",
        "comment: old",
        "topics:",
        "  - kept",
        "---",
        "тело",
        "",
      ].join(nl);
      await writeFile(path.join(harness.root, filename), handwritten);

      await harness.inbox.handle(plainText("new"));
      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );

      const commentLine = `comment: old${nl}`;
      const at = handwritten.indexOf(commentLine);
      const expected =
        handwritten.slice(0, at) +
        `comment: |-${nl}  old${nl}  new${nl}` +
        handwritten.slice(at + commentLine.length);
      const updated = await readFile(path.join(harness.root, filename), "utf8");
      expect(updated).toBe(expected);
      expect(updated.includes("\r\n")).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  const formatting: [string, string, MessageEntity[], string][] = [
    ["bold", "Hello", [{ type: "bold", offset: 0, length: 5 }], "**Hello**"],
    ["italic", "Hello", [{ type: "italic", offset: 0, length: 5 }], "*Hello*"],
    ["strikethrough", "Hello", [{ type: "strikethrough", offset: 0, length: 5 }], "~~Hello~~"],
    ["inline code", "use npm", [{ type: "code", offset: 4, length: 3 }], "use `npm`"],
    [
      "expandable blockquote",
      "note",
      [{ type: "expandable_blockquote", offset: 0, length: 4 }],
      "> note\n",
    ],
  ];

  it.each(formatting)("renders %s", async (_label, text, entities, body) => {
    await expectClipping(text, entities, body);
  });

  it("renders inline code that contains a backtick", async () => {
    await expectClipping("run a`b now", [{ type: "code", offset: 4, length: 3 }], "run ``a`b`` now");
  });

  it("renders a pre block with a language on its own lines", async () => {
    await expectClipping(
      "before print(1) after",
      [{ type: "pre", offset: 7, length: 8, language: "python" }],
      "before \n```python\nprint(1)\n```\n after",
    );
  });

  it("lengthens a pre fence past backticks inside the block", async () => {
    await expectClipping("```", [{ type: "pre", offset: 0, length: 3 }], "````\n```\n````\n");
  });

  it("renders a hidden text link", async () => {
    await expectClipping(
      "read the docs now",
      [{ type: "text_link", offset: 9, length: 4, url: "https://example.com/docs" }],
      "read the [docs](https://example.com/docs) now",
    );
  });

  it("uses UTF-16 offsets when an emoji precedes a link", async () => {
    const text = "👍 link";
    expect(text.length).toBe(7);
    await expectClipping(
      text,
      [{ type: "text_link", offset: 3, length: 4, url: "https://example.com/a" }],
      "👍 [link](https://example.com/a)",
    );
  });

  it("escapes brackets in link text and parentheses in the url", async () => {
    await expectClipping(
      "a[b]c",
      [{ type: "text_link", offset: 0, length: 5, url: "https://example.com/a(b) c" }],
      "[a\\[b\\]c](https://example.com/a%28b%29%20c)",
    );
  });

  it("nests italic inside bold", async () => {
    await expectClipping(
      "hello",
      [
        { type: "bold", offset: 0, length: 5 },
        { type: "italic", offset: 1, length: 3 },
      ],
      "**h*ell*o**",
    );
  });

  it("renders a bold link", async () => {
    await expectClipping(
      "docs",
      [
        { type: "text_link", offset: 0, length: 4, url: "https://example.com" },
        { type: "bold", offset: 0, length: 4 },
      ],
      "[**docs**](https://example.com)",
    );
  });

  it("reopens an italic span that partially overlaps bold", async () => {
    await expectClipping(
      "abcdef",
      [
        { type: "bold", offset: 0, length: 4 },
        { type: "italic", offset: 2, length: 4 },
      ],
      "**ab*cd***\u200b*ef*",
    );
  });

  it("renders bold and italic on the same range", async () => {
    await expectClipping(
      "text",
      [
        { type: "bold", offset: 0, length: 4 },
        { type: "italic", offset: 0, length: 4 },
      ],
      "***text***",
    );
  });

  it("moves whitespace outside inline markers and splits them on newlines", async () => {
    await expectClipping("x  bold  y", [{ type: "bold", offset: 1, length: 8 }], "x  **bold**  y");
    await expectClipping("hello\nworld", [{ type: "bold", offset: 0, length: 11 }], "**hello**\n**world**");
    await expectClipping("a   b", [{ type: "bold", offset: 1, length: 3 }], "a   b");
  });

  it("prefixes every blockquote line and keeps bold inside it", async () => {
    await expectClipping(
      "keep\nthis bold\nline",
      [
        { type: "blockquote", offset: 5, length: 14 },
        { type: "bold", offset: 10, length: 4 },
      ],
      "keep\n> this **bold**\n> line\n",
    );
  });

  it("keeps plain entity types as text", async () => {
    const text = "https://example.com @name #tag $USD /start me@x.com +1-212-555-0123 Alice";
    const at = (piece: string) => ({ offset: text.indexOf(piece), length: piece.length });
    await expectClipping(text, [
      { type: "url", ...at("https://example.com") },
      { type: "mention", ...at("@name") },
      { type: "hashtag", ...at("#tag") },
      { type: "cashtag", ...at("$USD") },
      { type: "bot_command", ...at("/start") },
      { type: "email", ...at("me@x.com") },
      { type: "phone_number", ...at("+1-212-555-0123") },
      { type: "text_mention", ...at("Alice"), user: { id: 5, is_bot: false, first_name: "Alice" } },
      { type: "underline", ...at("Alice") },
      { type: "spoiler", ...at("@name") },
      { type: "made_up", ...at("#tag") } as unknown as MessageEntity,
    ], text);
  });

  it("keeps a custom emoji's fallback character", async () => {
    const text = "nice 🎯 shot";
    expect("🎯".length).toBe(2);
    await expectClipping(
      text,
      [{ type: "custom_emoji", offset: 5, length: 2, custom_emoji_id: "emoji-1" }],
      text,
    );
  });

  it("does not escape markdown characters outside link text", async () => {
    await expectClipping("a * b # c", [{ type: "bold", offset: 0, length: 1 }], "**a** * b # c");
  });

  it("renders a mixed post", async () => {
    const text = ["🔥 Ship it", "", "See the docs today.", "Keep this bold", "line", "const n = 1"].join("\n");
    await expectClipping(
      text,
      [
        { type: "bold", offset: text.indexOf("Ship"), length: 4 },
        { type: "text_link", offset: text.indexOf("docs"), length: 4, url: "https://example.com/docs" },
        { type: "blockquote", offset: text.indexOf("Keep this bold"), length: "Keep this bold\nline".length },
        { type: "bold", offset: text.indexOf("bold"), length: 4 },
        { type: "pre", offset: text.indexOf("const n = 1"), length: "const n = 1".length, language: "ts" },
      ],
      "🔥 **Ship** it\n\nSee the [docs](https://example.com/docs) today.\n> Keep this **bold**\n> line\n```ts\nconst n = 1\n```\n",
    );
  });

  it("converts caption entities when the post has no text", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(
        channelForward({
          caption: "Hello",
          captionEntities: [{ type: "italic", offset: 0, length: 5 }],
          publishedAt,
          forwardedAt,
        }),
      );
      const filename = "2026-04-01 00-00 Denis Sexy IT 🤖.md";
      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(clippingNote("*Hello*"));
      expect(harness.replies).toEqual([{ chatId: 100, text: "2026-04-01 00-00 Denis Sexy IT 🤖" }]);
    } finally {
      await harness.cleanup();
    }
  });
});

function clippingNote(body: string): string {
  const normalized = body.endsWith("\n") ? body : `${body}\n`;
  return `---
categories:
  - "[[Clippings]]"
  - "[[Posts]]"
title: Denis Sexy IT 🤖
telegram: "[denissexy](https://t.me/denissexy)"
source: https://t.me/denissexy/11330
published: 2026-04-01
created: 2026-04-02
---
${normalized}`;
}

async function expectClipping(text: string, entities: MessageEntity[], body: string): Promise<void> {
  const harness = await createHarness();
  try {
    await harness.inbox.handle(channelForward({ text, entities, publishedAt, forwardedAt }));
    const filename = "2026-04-01 00-00 Denis Sexy IT 🤖.md";
    expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(clippingNote(body));
    expect(harness.replies).toEqual([{ chatId: 100, text: "2026-04-01 00-00 Denis Sexy IT 🤖" }]);
  } finally {
    await harness.cleanup();
  }
}
