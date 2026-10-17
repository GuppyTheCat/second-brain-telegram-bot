import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MessageEntity } from "grammy/types";
import { describe, expect, it, vi } from "vitest";
import { createHarness, scriptedMedia } from "./harness.js";
import {
  channelForward,
  chatForward,
  hiddenUserForward,
  photoMessage,
  photoSize,
  plainText,
  stickerMessage,
  userForward,
} from "./messages.js";

const dailyLinkHook = vi.hoisted(() => {
  return { fn: undefined as undefined | ((target: string) => Promise<void>) };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    link(
      existingPath: Parameters<typeof actual.link>[0],
      newPath: Parameters<typeof actual.link>[1],
    ): Promise<void> {
      const target = String(newPath);
      const hook = dailyLinkHook.fn;
      if (hook && target.endsWith("2026-10-17.md")) {
        dailyLinkHook.fn = undefined;
        return hook(target).then(() => actual.link(existingPath, newPath));
      }
      return actual.link(existingPath, newPath);
    },
  };
});

const publishedAt = Date.UTC(2026, 2, 31, 21, 0, 0) / 1000;
const forwardedAt = Date.UTC(2026, 3, 1, 22, 15, 0) / 1000;
const at1636 = Date.UTC(2026, 9, 17, 13, 36, 0) / 1000;
const at1640 = Date.UTC(2026, 9, 17, 13, 40, 0) / 1000;
const saturday = "Saturday, October 17th, 2026";
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
        { chatId: 100, messageId: 1, text: "2026-04-01 00-00 Denis Sexy IT 🤖" },
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

      const filename = "2026-04-01 13-00 Release Notes.md";
      expect(await readFile(path.join(harness.root, filename), "utf8")).toContain(
        'title: "Release: Notes"\n',
      );
      expect(harness.replies).toEqual([
        { chatId: 100, messageId: 1, text: "2026-04-01 13-00 Release Notes" },
      ]);
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
      const message = build();
      await harness.inbox.handle(message);
      expect(harness.replies).toEqual([
        { chatId: 100, messageId: message.message_id, text: "не поддерживается" },
      ]);
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
        { chatId: 100, messageId: 1, text: noteName },
        { chatId: 100, messageId: 1, text: `уже сохранено: ${noteName}` },
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
      expect(harness.replies).toEqual([{ chatId: 100, messageId: 1, text: `уже сохранено: ${noteName}` }]);
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
        { chatId: 100, messageId: 1, text: "2026-04-01 00-00 Denis Sexy IT 🤖" },
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
        { chatId: 100, messageId: 1, text: "2026-04-01 00-00 Denis Sexy IT 🤖" },
        { chatId: 100, messageId: 1, text: "2026-04-01 00-02 Denis Sexy IT 🤖" },
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

  it("appends one journal entry after the window and not before", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(plainText("Можно попробовать эту прогу для работы с PDF", at1636));
      await harness.clock.advance(2999);
      await harness.inbox.idle();
      expect(harness.replies).toEqual([]);
      await expect(dailyFile(harness.root, "2026-10-17")).rejects.toMatchObject({ code: "ENOENT" });

      await harness.clock.advance(1);
      await harness.inbox.idle();

      expect(await dailyFile(harness.root, "2026-10-17")).toBe(
        dailyNote("2026-10-17", saturday, [entry("16:36", "Можно попробовать эту прогу для работы с PDF")]),
      );
      expect(harness.replies).toEqual([{ chatId: 100, messageId: 7, text: "2026-10-17 16:36" }]);
      expect(await readdir(harness.root)).toEqual(["Periodic"]);
    } finally {
      await harness.cleanup();
    }
  });

  it("creates a missing daily note from the journal skeleton", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(plainText("заметка", at1636));
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      expect(await dailyFile(harness.root, "2026-10-17")).toBe(
        dailyNote("2026-10-17", saturday, [entry("16:36", "заметка")]),
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("keeps the journal when the daily note write fails and retries it", async () => {
    const harness = await createHarness();
    try {
      const blocker = path.join(harness.root, "Periodic", "Daily");
      await mkdir(path.dirname(blocker), { recursive: true });
      await writeFile(blocker, "not a directory\n");

      await harness.inbox.handle(plainText("не потерять", at1636));
      await expect(harness.clock.advance(3000)).rejects.toThrow("not a directory");
      expect(harness.replies).toEqual([]);

      await expect(harness.clock.advance(3000)).rejects.toThrow("not a directory");
      expect(harness.replies).toEqual([]);

      await rm(blocker);
      const later = plainText("ещё", at1640);
      later.message_id = 9;
      await harness.inbox.handle(later);
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      expect(await dailyFile(harness.root, "2026-10-17")).toBe(
        dailyNote("2026-10-17", saturday, [entry("16:36", "не потерять\nещё")]),
      );
      expect(harness.replies).toEqual([{ chatId: 100, messageId: 7, text: "2026-10-17 16:36" }]);
    } finally {
      await harness.cleanup();
    }
  });

  it("inserts into a daily note that appears while the missing file is created", async () => {
    const harness = await createHarness();
    const planted = dailyNote("2026-10-17", saturday, [entry("09:00", "уже было")]);
    // Runs from link(), after the missing-file read and before the exclusive create.
    dailyLinkHook.fn = async (target) => {
      await writeFile(target, planted);
    };
    try {
      await harness.inbox.handle(plainText("ещё", at1636));
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      expect(await dailyFile(harness.root, "2026-10-17")).toBe(
        dailyNote("2026-10-17", saturday, [entry("09:00", "уже было"), entry("16:36", "ещё")]),
      );
      expect(harness.replies).toEqual([{ chatId: 100, messageId: 7, text: "2026-10-17 16:36" }]);
      const names = await readdir(path.join(harness.root, "Periodic", "Daily"));
      expect(names).toEqual(["2026-10-17.md"]);
    } finally {
      dailyLinkHook.fn = undefined;
      await harness.cleanup();
    }
  });

  it("joins two texts inside the window into one entry", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(plainText("Можно попробовать эту прогу для работы с PDF", at1636));
      await harness.clock.advance(2500);
      const later = plainText("https://www.reddit.com/r/BestGitHubRepos/s/LrV8Q33YSc", at1636 + 20);
      later.message_id = 8;
      await harness.inbox.handle(later);
      await harness.clock.advance(2999);
      await harness.inbox.idle();
      expect(harness.replies).toEqual([]);

      await harness.clock.advance(1);
      await harness.inbox.idle();

      expect(await dailyFile(harness.root, "2026-10-17")).toBe(
        dailyNote("2026-10-17", saturday, [
          entry(
            "16:36",
            "Можно попробовать эту прогу для работы с PDF\nhttps://www.reddit.com/r/BestGitHubRepos/s/LrV8Q33YSc",
          ),
        ]),
      );
      expect(harness.replies).toEqual([{ chatId: 100, messageId: 7, text: "2026-10-17 16:36" }]);
    } finally {
      await harness.cleanup();
    }
  });

  it("keeps journal text as sent", async () => {
    const harness = await createHarness();
    try {
      const message = plainText("жирный", at1636);
      message.entities = [{ type: "bold", offset: 0, length: 6 }];
      await harness.inbox.handle(message);
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      const content = await dailyFile(harness.root, "2026-10-17");
      expect(content).toContain("### 16:36\nжирный\n");
      expect(content).not.toContain("**");
    } finally {
      await harness.cleanup();
    }
  });

  it("appends a second entry when a message arrives after the window", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(plainText("первая", at1636));
      await harness.clock.advance(3000);
      await harness.inbox.idle();
      const second = plainText("вторая", at1640);
      second.message_id = 8;
      await harness.inbox.handle(second);
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      expect(await dailyFile(harness.root, "2026-10-17")).toBe(
        dailyNote("2026-10-17", saturday, [entry("16:36", "первая"), entry("16:40", "вторая")]),
      );
      expect(harness.replies).toEqual([
        { chatId: 100, messageId: 7, text: "2026-10-17 16:36" },
        { chatId: 100, messageId: 8, text: "2026-10-17 16:40" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("inserts the next entry at the end of an existing journal", async () => {
    const harness = await createHarness();
    try {
      const folder = path.join(harness.root, "Periodic", "Daily");
      await mkdir(folder, { recursive: true });
      await writeFile(
        path.join(folder, "2026-10-17.md"),
        dailyNote("2026-10-17", saturday, [entry("09:00", "уже было")]),
      );

      await harness.inbox.handle(plainText("ещё", at1636));
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      expect(await dailyFile(harness.root, "2026-10-17")).toBe(
        dailyNote("2026-10-17", saturday, [entry("09:00", "уже было"), entry("16:36", "ещё")]),
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("appends the next entry after a horizontal rule in the journal body", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(plainText("---", at1636));
      await harness.clock.advance(3000);
      await harness.inbox.idle();
      await harness.inbox.handle(plainText("после", at1640));
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      expect(await dailyFile(harness.root, "2026-10-17")).toBe(
        dailyNote("2026-10-17", saturday, [entry("16:36", "---"), entry("16:40", "после")]),
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("adds a journal section before the divider that precedes the task embeds", async () => {
    const harness = await createHarness();
    try {
      const folder = path.join(harness.root, "Periodic", "Daily");
      await mkdir(folder, { recursive: true });
      await writeFile(
        path.join(folder, "2026-10-17.md"),
        `---
categories:
  - "[[Journal]]"
created: 2026-10-17
tags:
  - daily
---

# Saturday, October 17th, 2026

## Notes
a thought

---

still notes
![[Daily.base]]

---

![[tasks-default.base#Today]]

---

![[tasks-default.base#Past tasks]]

---
![[Daily Note - Inbox]]
`,
      );

      await harness.inbox.handle(plainText("заметка", at1636));
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      expect(await dailyFile(harness.root, "2026-10-17")).toBe(`---
categories:
  - "[[Journal]]"
created: 2026-10-17
tags:
  - daily
---

# Saturday, October 17th, 2026

## Notes
a thought

---

still notes
![[Daily.base]]

## Journal
### 16:36
заметка

---

![[tasks-default.base#Today]]

---

![[tasks-default.base#Past tasks]]

---
![[Daily Note - Inbox]]
`);
    } finally {
      await harness.cleanup();
    }
  });

  it("adds a journal section before the first divider when the daily note has none", async () => {
    const harness = await createHarness();
    try {
      const folder = path.join(harness.root, "Periodic", "Daily");
      await mkdir(folder, { recursive: true });
      await writeFile(
        path.join(folder, "2026-10-17.md"),
        `---
categories:
  - "[[Journal]]"
created: 2026-10-17
tags:
  - daily
---

# Saturday, October 17th, 2026

## Notes
![[Daily.base]]

---

![[tasks-default.base#Today]]

---

![[tasks-default.base#Past tasks]]

---
![[Daily Note - Inbox]]
`,
      );

      await harness.inbox.handle(plainText("заметка", at1636));
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      expect(await dailyFile(harness.root, "2026-10-17")).toBe(
        dailyNote("2026-10-17", saturday, [entry("16:36", "заметка")]),
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("formats the daily heading with English ordinals", async () => {
    const harness = await createHarness();
    try {
      const cases: [number, string][] = [
        [1, "Wednesday, April 1st, 2026"],
        [2, "Thursday, April 2nd, 2026"],
        [3, "Friday, April 3rd, 2026"],
        [11, "Saturday, April 11th, 2026"],
        [21, "Tuesday, April 21st, 2026"],
        [22, "Wednesday, April 22nd, 2026"],
        [23, "Thursday, April 23rd, 2026"],
      ];
      for (const [day, heading] of cases) {
        const unix = Date.UTC(2026, 3, day, 9, 0, 0) / 1000;
        await harness.inbox.handle(plainText("x", unix));
        await harness.clock.advance(3000);
        await harness.inbox.idle();
        const date = `2026-04-${String(day).padStart(2, "0")}`;
        const content = await dailyFile(harness.root, date);
        expect(content).toContain(`# ${heading}\n`);
        expect(content).toContain(`created: ${date}\n`);
        expect(content).toContain("### 12:00\nx\n");
      }
    } finally {
      await harness.cleanup();
    }
  });

  it("writes midnight as 00:00 in the vault timezone", async () => {
    const harness = await createHarness();
    try {
      const midnight = Date.UTC(2026, 9, 16, 21, 0, 0) / 1000;
      await harness.inbox.handle(plainText("ночь", midnight));
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      const content = await dailyFile(harness.root, "2026-10-17");
      expect(content).toContain("# Saturday, October 17th, 2026\n");
      expect(content).toContain("### 00:00\nночь\n");
      expect(harness.replies).toEqual([{ chatId: 100, messageId: 7, text: "2026-10-17 00:00" }]);
    } finally {
      await harness.cleanup();
    }
  });

  it("appends a callout-only entry for a forward and saves a clipping without a comment", async () => {
    const harness = await createHarness();
    try {
      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );
      await harness.clock.advance(2999);
      await harness.inbox.idle();

      const filename = "2026-04-01 00-00 Denis Sexy IT 🤖.md";
      const noteName = "2026-04-01 00-00 Denis Sexy IT 🤖";
      const clipping = await readFile(path.join(harness.root, filename), "utf8");
      expect(clipping).not.toContain("comment:");
      expect(harness.replies).toEqual([{ chatId: 100, messageId: 1, text: noteName }]);
      await expect(dailyFile(harness.root, "2026-04-02")).rejects.toMatchObject({ code: "ENOENT" });

      await harness.clock.advance(1);
      await harness.inbox.idle();

      expect(await readFile(path.join(harness.root, filename), "utf8")).toBe(clipping);
      expect(await dailyFile(harness.root, "2026-04-02")).toBe(
        dailyNote("2026-04-02", "Thursday, April 2nd, 2026", [entry("01:15", postCallout(noteName))]),
      );
      expect(harness.replies).toEqual([
        { chatId: 100, messageId: 1, text: noteName },
        { chatId: 100, messageId: 1, text: "2026-04-02 01:15" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("records text and a following forward as one entry", async () => {
    const harness = await createHarness();
    try {
      const noteName = "2026-04-01 00-00 Denis Sexy IT 🤖";
      await harness.inbox.handle(plainText("Можно попробовать эту прогу для работы с PDF", forwardedAt));
      await harness.inbox.handle(
        channelForward({
          text: postText,
          publishedAt,
          forwardedAt,
        }),
      );
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      const clipping = await readFile(path.join(harness.root, `${noteName}.md`), "utf8");
      expect(clipping).not.toContain("comment:");
      expect(clipping).toContain(`${postText}\n`);
      expect(await dailyFile(harness.root, "2026-04-02")).toBe(
        dailyNote("2026-04-02", "Thursday, April 2nd, 2026", [
          entry("01:15", `Можно попробовать эту прогу для работы с PDF\n${postCallout(noteName)}`),
        ]),
      );
      expect(harness.replies).toEqual([
        { chatId: 100, messageId: 1, text: noteName },
        { chatId: 100, messageId: 7, text: "2026-04-02 01:15" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("adds a callout when a duplicate forward points at the existing note", async () => {
    const harness = await createHarness();
    try {
      const forward = channelForward({
        text: postText,
        publishedAt,
        forwardedAt,
      });
      const noteName = "2026-04-01 00-00 Denis Sexy IT 🤖";
      await harness.inbox.handle(forward);
      await harness.clock.advance(3000);
      await harness.inbox.idle();
      const clipping = await readFile(path.join(harness.root, `${noteName}.md`), "utf8");

      await harness.inbox.handle(forward);
      await harness.clock.advance(3000);
      await harness.inbox.idle();

      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).toBe(clipping);
      expect(clipping).not.toContain("comment:");
      expect(await dailyFile(harness.root, "2026-04-02")).toBe(
        dailyNote("2026-04-02", "Thursday, April 2nd, 2026", [
          entry("01:15", postCallout(noteName)),
          entry("01:15", postCallout(noteName)),
        ]),
      );
      expect(harness.replies).toEqual([
        { chatId: 100, messageId: 1, text: noteName },
        { chatId: 100, messageId: 1, text: "2026-04-02 01:15" },
        { chatId: 100, messageId: 1, text: `уже сохранено: ${noteName}` },
        { chatId: 100, messageId: 1, text: "2026-04-02 01:15" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("adds one callout when an album is saved", async () => {
    const media = scriptedMedia({
      a: { bytes: new Uint8Array([1]) },
      b: { bytes: new Uint8Array([2]) },
    });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      const noteName = "2026-04-01 00-00 Denis Sexy IT 🤖";
      await harness.inbox.handle(
        channelForward({
          mediaGroupId: "album",
          postId: 10,
          messageId: 10,
          caption: "пост",
          photo: [photoSize("a", 800, 600)],
          publishedAt,
          forwardedAt,
        }),
      );
      await harness.inbox.handle(
        channelForward({
          mediaGroupId: "album",
          postId: 11,
          messageId: 11,
          photo: [photoSize("b", 800, 600)],
          publishedAt,
          forwardedAt,
        }),
      );

      await harness.clock.advance(1500);
      await harness.inbox.idle();
      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).not.toContain("comment:");
      expect(harness.replies).toEqual([{ chatId: 100, messageId: 10, text: noteName }]);
      await expect(dailyFile(harness.root, "2026-04-02")).rejects.toMatchObject({ code: "ENOENT" });

      await harness.clock.advance(2999);
      await harness.inbox.idle();
      await expect(dailyFile(harness.root, "2026-04-02")).rejects.toMatchObject({ code: "ENOENT" });

      await harness.clock.advance(1);
      await harness.inbox.idle();
      expect(await dailyFile(harness.root, "2026-04-02")).toBe(
        dailyNote("2026-04-02", "Thursday, April 2nd, 2026", [entry("01:15", postCallout(noteName))]),
      );
      expect(harness.replies).toEqual([
        { chatId: 100, messageId: 10, text: noteName },
        { chatId: 100, messageId: 10, text: "2026-04-02 01:15" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("does not flush the journal while an album is still open", async () => {
    const media = scriptedMedia({
      a: { bytes: new Uint8Array([1]) },
      b: { bytes: new Uint8Array([2]) },
    });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      const noteName = "2026-04-01 00-00 Denis Sexy IT 🤖";
      await harness.inbox.handle(plainText("к альбому", forwardedAt));
      await harness.clock.advance(2500);
      await harness.inbox.handle(
        channelForward({
          mediaGroupId: "album",
          postId: 10,
          messageId: 10,
          caption: "пост",
          photo: [photoSize("a", 800, 600)],
          publishedAt,
          forwardedAt,
        }),
      );
      await harness.clock.advance(200);
      await harness.inbox.handle(
        channelForward({
          mediaGroupId: "album",
          postId: 11,
          messageId: 11,
          photo: [photoSize("b", 800, 600)],
          publishedAt,
          forwardedAt,
        }),
      );
      await harness.clock.advance(1499);
      await harness.inbox.idle();
      expect(harness.replies).toEqual([]);
      await expect(dailyFile(harness.root, "2026-04-02")).rejects.toMatchObject({ code: "ENOENT" });

      await harness.clock.advance(1);
      await harness.inbox.idle();
      expect(await readFile(path.join(harness.root, `${noteName}.md`), "utf8")).not.toContain("comment:");
      expect(harness.replies).toEqual([{ chatId: 100, messageId: 10, text: noteName }]);
      await expect(dailyFile(harness.root, "2026-04-02")).rejects.toMatchObject({ code: "ENOENT" });

      await harness.clock.advance(3000);
      await harness.inbox.idle();
      expect(await dailyFile(harness.root, "2026-04-02")).toBe(
        dailyNote("2026-04-02", "Thursday, April 2nd, 2026", [
          entry("01:15", `к альбому\n${postCallout(noteName)}`),
        ]),
      );
      expect(harness.replies).toEqual([
        { chatId: 100, messageId: 10, text: noteName },
        { chatId: 100, messageId: 7, text: "2026-04-02 01:15" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("does not coalesce a later message into a journal held by a failed album save", async () => {
    const media = scriptedMedia({});
    const harness = await createHarness("Europe/Moscow", media);
    try {
      await harness.inbox.handle(plainText("раннее", forwardedAt));
      await harness.inbox.handle(
        channelForward({
          mediaGroupId: "album",
          postId: 10,
          messageId: 10,
          caption: "пост",
          photo: [photoSize("missing", 800, 600)],
          publishedAt,
          forwardedAt,
        }),
      );

      await harness.clock.advance(1499);
      await harness.inbox.idle();
      await expect(dailyFile(harness.root, "2026-04-02")).rejects.toMatchObject({ code: "ENOENT" });

      await expect(harness.clock.advance(1)).rejects.toThrow("unexpected media file: missing");

      await harness.clock.advance(60 * 60 * 1000);
      await harness.inbox.idle();
      expect(await dailyFile(harness.root, "2026-04-02")).toBe(
        dailyNote("2026-04-02", "Thursday, April 2nd, 2026", [entry("01:15", "раннее")]),
      );

      await harness.inbox.handle(plainText("позже", forwardedAt + 60 * 60));
      await harness.clock.advance(3000);
      await harness.inbox.idle();
      expect(await dailyFile(harness.root, "2026-04-02")).toBe(
        dailyNote("2026-04-02", "Thursday, April 2nd, 2026", [
          entry("01:15", "раннее"),
          entry("02:15", "позже"),
        ]),
      );
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
      expect(harness.replies).toEqual([
        { chatId: 100, messageId: 1, text: "2026-04-01 00-00 Denis Sexy IT 🤖" },
      ]);
    } finally {
      await harness.cleanup();
    }
  });
});

function dailyNote(date: string, heading: string, entries: readonly string[]): string {
  return `---
categories:
  - "[[Journal]]"
created: ${date}
tags:
  - daily
---

# ${heading}

## Notes
![[Daily.base]]

## Journal
${entries.join("\n\n")}

---

![[tasks-default.base#Today]]

---

![[tasks-default.base#Past tasks]]

---
![[Daily Note - Inbox]]
`;
}

function entry(time: string, body: string): string {
  return `### ${time}\n${body}`;
}

function postCallout(noteName: string): string {
  return `> [!post]\n> [[${noteName}]]`;
}

async function dailyFile(root: string, date: string): Promise<string> {
  return readFile(path.join(root, "Periodic", "Daily", `${date}.md`), "utf8");
}

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
    expect(harness.replies).toEqual([
      { chatId: 100, messageId: 1, text: "2026-04-01 00-00 Denis Sexy IT 🤖" },
    ]);
  } finally {
    await harness.cleanup();
  }
}
