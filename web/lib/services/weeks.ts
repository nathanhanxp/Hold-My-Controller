import { sha256Hex } from "@forklab/engine";

/** ISO week id YYYYWW (UTC). Challenge ids derive from it so the weekly job is idempotent. */
export function isoWeekId(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}${String(week).padStart(2, "0")}`;
}

export const gameIdFor = (d: Date) => `game-${isoWeekId(d)}`;

/** Seed = hash of the week id, as a uint32. */
export function weekSeed(id: string): number {
  return parseInt(sha256Hex(`forklab-week:${id}`).slice(0, 8), 16) >>> 0;
}
