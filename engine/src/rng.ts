// Named, independently seeded random streams. Ported from res-q chaos-engine/src/core/random.ts
// (xmur3 seeding + sfc32 generator). Getting streams in a different order never changes a sequence.
// The C# port in export-csharp.ts (ForkLabCore.Rng) uses the same uint arithmetic.

const UINT32_RANGE = 0x1_0000_0000;

export interface RandomStream {
  nextUint32(): number;
  /** Uniform integer in [minInclusive, maxExclusive). */
  nextInt(minInclusive: number, maxExclusive: number): number;
}

export class SeededRng {
  readonly #prefix: string;
  readonly #streams = new Map<string, RandomStream>();

  constructor(seed: string | number) {
    this.#prefix = `${String(seed)}\u0000`;
  }

  stream(name: string): RandomStream {
    if (name.length === 0) throw new RangeError("Random stream names must not be empty.");
    if (!/^[\x20-\x7e]+$/.test(name)) throw new RangeError("Random stream names must be printable ASCII.");
    const existing = this.#streams.get(name);
    if (existing) return existing;
    const s = createStream(this.#prefix, name);
    this.#streams.set(name, s);
    return s;
  }
}

function createStream(prefix: string, name: string): RandomStream {
  const hash = xmur3(prefix + name);
  let a = hash();
  let b = hash();
  let c = hash();
  let d = hash();
  const nextUint32 = (): number => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const result = (a + b + d) >>> 0;
    d = (d + 1) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + result) >>> 0;
    return result;
  };
  return {
    nextUint32,
    nextInt(min: number, maxExclusive: number): number {
      const span = maxExclusive - min;
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(maxExclusive) || span <= 0 || span > UINT32_RANGE) {
        throw new RangeError("Random range must contain between 1 and 2^32 values.");
      }
      if (span === UINT32_RANGE) return min + nextUint32();
      const limit = UINT32_RANGE - (UINT32_RANGE % span);
      let v = nextUint32();
      while (v >= limit) v = nextUint32();
      return min + (v % span);
    },
  };
}

/** xmur3 string hash; total length is mixed in first, as in the original. */
function xmur3(input: string): () => number {
  let h = 1_779_033_703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3_432_918_353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2_246_822_507);
    h = Math.imul(h ^ (h >>> 13), 3_266_489_909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
