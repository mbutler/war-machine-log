export interface Random {
  next(): number; // [0,1)
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  shuffle<T>(items: readonly T[]): T[];
  uid(prefix?: string): string; // Deterministic unique ID
}

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

// Mulberry32
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRandom(seed: string): Random {
  const rng = mulberry32(hashSeed(seed));
  let uidCounter = 0; // Deterministic counter for unique IDs
  
  return {
    next: rng,
    int(maxExclusive: number) {
      if (maxExclusive <= 1) return 0;
      return Math.floor(rng() * maxExclusive);
    },
    pick<T>(items: readonly T[]): T {
      if (!items.length) {
        throw new Error('Attempted to pick from an empty list.');
      }
      return items[this.int(items.length)];
    },
    chance(probability: number): boolean {
      if (probability <= 0) return false;
      if (probability >= 1) return true;
      return rng() < probability;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const result = [...items];
      // Fisher-Yates shuffle
      for (let i = result.length - 1; i > 0; i--) {
        const j = this.int(i + 1);
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    },
    uid(prefix?: string): string {
      // Deterministic unique ID using counter + RNG
      const id = `${++uidCounter}-${this.int(100000)}`;
      return prefix ? `${prefix}-${id}` : id;
    },
  };
}

