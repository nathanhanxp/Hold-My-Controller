// Fixed-point helpers. 1 world unit = 1000 milli-units. State is always integer and within int32.

export const UNIT = 1000;
export const TICKS_PER_SECOND = 60;
export const INT32_MAX = 2_147_483_647;
export const INT32_MIN = -2_147_483_648;
/** Positions and velocities are clamped to this range so sums never overflow int32. */
export const STATE_LIMIT = 100_000_000;

export function clampState(v: number): number {
  if (!Number.isInteger(v)) throw new TypeError(`fixed-point state must be integer, got ${v}`);
  return v > STATE_LIMIT ? STATE_LIMIT : v < -STATE_LIMIT ? -STATE_LIMIT : v;
}

/** Integer division that truncates toward zero, like C#. */
export function idiv(a: number, b: number): number {
  if (b === 0) return 0;
  return Math.trunc(a / b);
}

/** Coerce an untrusted parameter to a safe int32 value. */
export function toInt(v: unknown): number {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  const t = Math.trunc(v);
  return t > INT32_MAX ? INT32_MAX : t < INT32_MIN ? INT32_MIN : t;
}

/** Wrapping int32 add, identical to unchecked C# int addition. */
export function add32(a: number, b: number): number {
  return (a + b) | 0;
}
