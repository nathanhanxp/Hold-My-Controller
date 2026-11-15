// One-at-a-time anchoring queue (Night Watch chain/chain.ts pattern): records go out in order with a 1.2 s gap,
// a 429 doubles the backoff up to 60 s and keeps the record at the front, and a retry sweep runs every 20 s.

export type WriteOutcome = "ok" | "skip" | "failed" | "rate-limited";

export class AnchorQueue {
  readonly queue: string[] = [];
  backoffMs = 0;
  draining = false;
  log: string[] = [];
  constructor(
    private readonly write: (id: string) => Promise<WriteOutcome>,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    readonly gapMs = 1_200,
    readonly maxBackoffMs = 60_000,
  ) {}

  enqueue(id: string) {
    if (this.queue.includes(id)) return;
    this.queue.push(id);
    void this.drain();
  }

  async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        if (this.backoffMs) {
          this.log.push(`backoff ${this.backoffMs}`);
          await this.sleep(this.backoffMs);
        }
        const id = this.queue[0];
        const r = await this.write(id);
        if (r === "rate-limited") {
          this.backoffMs = Math.min(this.maxBackoffMs, Math.max(5_000, this.backoffMs * 2));
          continue;
        }
        this.queue.shift();
        this.backoffMs = 0;
        this.log.push(`${r} ${id}`);
        await this.sleep(this.gapMs);
      }
    } finally {
      this.draining = false;
    }
  }
}

export const isRateLimited = (msg: string) => msg.includes("429") || /too many requests/i.test(msg);
