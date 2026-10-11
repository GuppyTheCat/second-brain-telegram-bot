export interface Clock {
  now(): number;
  setTimeout(fn: () => void | Promise<void>, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export function systemClock(): Clock {
  return {
    now: () => Date.now(),
    setTimeout(fn, ms) {
      return setTimeout(() => {
        void Promise.resolve(fn()).catch((error: unknown) => {
          console.error(error);
        });
      }, ms);
    },
    clearTimeout(id) {
      clearTimeout(id as ReturnType<typeof setTimeout>);
    },
  };
}

/**
 * Deterministic clock. `advance` fires due timers in order and awaits each
 * callback, so a callback that returns a promise (for example Inbox queue
 * work) is finished before `advance` resolves.
 */
export class ManualClock implements Clock {
  private current = 0;
  private nextId = 1;
  private timers: { id: number; at: number; fn: () => void | Promise<void> }[] = [];

  now(): number {
    return this.current;
  }

  setTimeout(fn: () => void | Promise<void>, ms: number): number {
    const id = this.nextId++;
    this.timers.push({ id, at: this.current + ms, fn });
    return id;
  }

  clearTimeout(id: unknown): void {
    this.timers = this.timers.filter((timer) => timer.id !== id);
  }

  async advance(ms: number): Promise<void> {
    const target = this.current + ms;
    for (;;) {
      const due = this.timers
        .filter((timer) => timer.at <= target)
        .sort((a, b) => a.at - b.at || a.id - b.id);
      const next = due[0];
      if (!next) break;
      this.timers = this.timers.filter((timer) => timer.id !== next.id);
      this.current = next.at;
      await next.fn();
    }
    this.current = target;
  }
}
