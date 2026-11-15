/** Three consecutive failures inside 60 s open the breaker for 60 s; then one half-open probe decides. */
export type BreakerState = "closed" | "open" | "half_open";

export class Breaker {
  private failures: number[] = [];
  private openedAt = 0;
  private probing = false;
  state: BreakerState = "closed";
  constructor(private readonly threshold = 3, private readonly windowMs = 60_000, private readonly coolMs = 60_000, private readonly now = () => Date.now()) {}

  /** Whether a request may go to this provider now. In half-open, only one probe at a time. */
  allow(): boolean {
    if (this.state === "open") {
      if (this.now() - this.openedAt >= this.coolMs) { this.state = "half_open"; this.probing = false; }
      else return false;
    }
    if (this.state === "half_open") {
      if (this.probing) return false;
      this.probing = true;
      return true;
    }
    return true;
  }
  success() {
    this.failures = [];
    this.state = "closed";
    this.probing = false;
  }
  failure() {
    const t = this.now();
    if (this.state === "half_open") { this.state = "open"; this.openedAt = t; this.probing = false; return; }
    this.failures = [...this.failures.filter((f) => t - f < this.windowMs), t];
    if (this.failures.length >= this.threshold) { this.state = "open"; this.openedAt = t; this.failures = []; }
  }
}
