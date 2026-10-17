import { describe, expect, it, vi } from "vitest";
import { logInboxOutcome } from "../src/bot.js";
import type { Harness } from "./harness.js";
import { createHarness, scriptedMedia } from "./harness.js";
import { channelForward, photoSize, plainText, stickerMessage } from "./messages.js";

const at1636 = Date.UTC(2026, 9, 17, 13, 36, 0) / 1000;
const noteName = "2026-10-17 16-36 Some channel";

function capture(run: () => void): string[] {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map((part) => String(part)).join(" "));
  });
  try {
    run();
  } finally {
    spy.mockRestore();
  }
  return lines;
}

async function loggedDecisions(harness: Harness, action: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const from = harness.outcomes.length;
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map((part) => String(part)).join(" "));
  });
  try {
    await action();
    for (const outcome of harness.outcomes.slice(from)) logInboxOutcome(outcome);
    return lines;
  } finally {
    spy.mockRestore();
  }
}

describe("logInboxOutcome", () => {
  it("logs one line per decision with message id and class and no body", () => {
    const lines = capture(() => {
      logInboxOutcome({ type: "buffered", messageId: 100, class: "text" });
      logInboxOutcome({ type: "buffered", messageId: 101, class: "text" });
      logInboxOutcome({
        type: "journal",
        messageId: 100,
        class: "text",
        when: "2026-10-17 16:36",
      });
      logInboxOutcome({ type: "saved", messageId: 102, class: "channel", noteName });
      logInboxOutcome({ type: "duplicate", messageId: 105, class: "channel", noteName });
      logInboxOutcome({ type: "buffered", messageId: 103, class: "album" });
      logInboxOutcome({ type: "unsupported", messageId: 104, class: "unsupported" });
    });

    expect(lines).toEqual([
      "msg 100 class=text outcome=buffered",
      "msg 101 class=text outcome=buffered",
      "msg 100 class=text outcome=journal 2026-10-17 16:36",
      `msg 102 class=channel outcome=saved ${noteName}`,
      `msg 105 class=channel outcome=duplicate ${noteName}`,
      "msg 103 class=album outcome=buffered",
      "msg 104 class=unsupported outcome=unsupported",
    ]);
  });
});

describe("inbox decision identity", () => {
  it("logs buffered text and the journal flush under the first message id", async () => {
    const harness = await createHarness();
    try {
      const first = plainText("секретная мысль", at1636);
      first.message_id = 100;
      const second = plainText("ещё одна мысль", at1636);
      second.message_id = 101;

      const lines = await loggedDecisions(harness, async () => {
        logInboxOutcome(await harness.inbox.handle(first));
        logInboxOutcome(await harness.inbox.handle(second));
        await harness.clock.advance(3000);
        await harness.inbox.idle();
      });

      expect(lines).toEqual([
        "msg 100 class=text outcome=buffered",
        "msg 101 class=text outcome=buffered",
        "msg 100 class=text outcome=journal 2026-10-17 16:36",
      ]);
      expect(lines.join("\n")).not.toContain("секретная");
    } finally {
      await harness.cleanup();
    }
  });

  it("logs a saved channel post and a duplicate without the message body", async () => {
    const harness = await createHarness();
    try {
      const forward = channelForward({
        text: "тело поста не для лога",
        channelTitle: "Some channel",
        username: "somechannel",
        postId: 42,
        messageId: 102,
        publishedAt: at1636,
        forwardedAt: at1636,
      });
      const again = channelForward({
        text: "тело поста не для лога",
        channelTitle: "Some channel",
        username: "somechannel",
        postId: 42,
        messageId: 105,
        publishedAt: at1636,
        forwardedAt: at1636,
      });

      const lines = await loggedDecisions(harness, async () => {
        logInboxOutcome(await harness.inbox.handle(forward));
        logInboxOutcome(await harness.inbox.handle(again));
      });

      expect(lines).toEqual([
        `msg 102 class=channel outcome=saved ${noteName}`,
        `msg 105 class=channel outcome=duplicate ${noteName}`,
      ]);
      expect(lines.join("\n")).not.toContain("тело поста");
    } finally {
      await harness.cleanup();
    }
  });

  it("logs each album part as buffered and the flush through onOutcome", async () => {
    const media = scriptedMedia({ a: { bytes: new Uint8Array([1]) } });
    const harness = await createHarness("Europe/Moscow", media);
    try {
      const part = channelForward({
        mediaGroupId: "album",
        messageId: 103,
        postId: 7,
        caption: "подпись не для лога",
        photo: [photoSize("a", 100, 100)],
        channelTitle: "Some channel",
        username: "somechannel",
        publishedAt: at1636,
        forwardedAt: at1636,
      });

      const lines = await loggedDecisions(harness, async () => {
        logInboxOutcome(await harness.inbox.handle(part));
        await harness.clock.advance(1500);
        await harness.inbox.idle();
      });

      expect(lines).toEqual([
        "msg 103 class=album outcome=buffered",
        `msg 103 class=album outcome=saved ${noteName}`,
      ]);
      expect(lines.join("\n")).not.toContain("подпись");
    } finally {
      await harness.cleanup();
    }
  });

  it("logs an unsupported message", async () => {
    const harness = await createHarness();
    try {
      const sticker = stickerMessage();
      sticker.message_id = 104;

      const lines = await loggedDecisions(harness, async () => {
        logInboxOutcome(await harness.inbox.handle(sticker));
      });

      expect(lines).toEqual(["msg 104 class=unsupported outcome=unsupported"]);
    } finally {
      await harness.cleanup();
    }
  });

  it("uses the first buffered message for a journal that later includes a forward", async () => {
    const harness = await createHarness();
    try {
      const text = plainText("к посту", at1636);
      text.message_id = 100;
      const forward = channelForward({
        text: "пост",
        channelTitle: "Some channel",
        username: "somechannel",
        postId: 9,
        messageId: 102,
        publishedAt: at1636,
        forwardedAt: at1636,
      });

      const lines = await loggedDecisions(harness, async () => {
        logInboxOutcome(await harness.inbox.handle(text));
        logInboxOutcome(await harness.inbox.handle(forward));
        await harness.clock.advance(3000);
        await harness.inbox.idle();
      });

      expect(lines).toEqual([
        "msg 100 class=text outcome=buffered",
        `msg 102 class=channel outcome=saved ${noteName}`,
        "msg 100 class=text outcome=journal 2026-10-17 16:36",
      ]);
    } finally {
      await harness.cleanup();
    }
  });
});
