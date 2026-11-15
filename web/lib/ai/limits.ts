// Constants from res-q's agent orchestrator: one request in flight, eight per minute, size caps.
export const MAX_IN_FLIGHT = 1;
export const MAX_PER_MINUTE = 8;
export const MAX_PROMPT_CHARS = 2_000;
export const MAX_IMAGE_BYTES = 2_000_000;
export const MAX_FREE_TEXT = 80;

export class RateLimiter {
  private inFlight = 0;
  private stamps: number[] = [];
  constructor(private readonly perMinute = MAX_PER_MINUTE, private readonly maxInFlight = MAX_IN_FLIGHT, private readonly now = () => Date.now()) {}
  tryAcquire(): { ok: true; release: () => void } | { ok: false; reason: string } {
    const t = this.now();
    this.stamps = this.stamps.filter((s) => t - s < 60_000);
    if (this.inFlight >= this.maxInFlight) return { ok: false, reason: "The assistant is answering another request. Try again in a moment." };
    if (this.stamps.length >= this.perMinute) return { ok: false, reason: "The assistant is limited to eight requests a minute. Try again shortly." };
    this.inFlight += 1;
    this.stamps.push(t);
    let released = false;
    return { ok: true, release: () => { if (!released) { released = true; this.inFlight -= 1; } } };
  }
}
