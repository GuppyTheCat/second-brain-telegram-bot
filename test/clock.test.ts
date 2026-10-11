import { describe, expect, it } from "vitest";
import { ManualClock } from "../src/clock.js";

describe("ManualClock", () => {
  it("fires due timers in order and awaits async callbacks", async () => {
    const clock = new ManualClock();
    const order: string[] = [];

    clock.setTimeout(() => {
      order.push("late");
    }, 30);

    clock.setTimeout(async () => {
      order.push("early-start");
      await Promise.resolve();
      order.push("early-end");
      clock.setTimeout(() => {
        order.push("follow-up");
      }, 10);
    }, 10);

    const cleared = clock.setTimeout(() => {
      order.push("cleared");
    }, 20);
    clock.clearTimeout(cleared);

    await clock.advance(25);
    expect(order).toEqual(["early-start", "early-end", "follow-up"]);
    expect(clock.now()).toBe(25);

    await clock.advance(10);
    expect(order).toEqual(["early-start", "early-end", "follow-up", "late"]);
  });
});
