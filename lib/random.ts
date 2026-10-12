/**
 * Seeded pseudo-random source. The dataset generator and the simulation both
 * draw from this so a given seed always produces the same world — which is what
 * makes "Reset simulation" restore the original dataset exactly, and makes the
 * business layer testable without stubbing `Math.random`.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number
  /** Uniform float in [min, max). */
  float(min: number, max: number): number
  /** True with probability `p`. */
  chance(p: number): boolean
  pick<T>(items: readonly T[]): T
  /** Index chosen in proportion to `weights`. */
  weighted(weights: readonly number[]): number
  shuffle<T>(items: readonly T[]): T[]
}

/** Mulberry32 — small, fast, and good enough for simulation jitter. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }

  const float = (min: number, max: number): number => min + next() * (max - min)

  const int = (min: number, max: number): number =>
    Math.floor(float(min, max + 1))

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error("Rng.pick called with an empty collection")
    }
    return items[int(0, items.length - 1)] as T
  }

  const weighted = (weights: readonly number[]): number => {
    const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0)
    if (total <= 0) {
      return 0
    }
    let threshold = next() * total
    for (let index = 0; index < weights.length; index += 1) {
      threshold -= Math.max(0, weights[index] ?? 0)
      if (threshold <= 0) {
        return index
      }
    }
    return weights.length - 1
  }

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items]
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = int(0, index)
      const current = copy[index] as T
      copy[index] = copy[swap] as T
      copy[swap] = current
    }
    return copy
  }

  return {
    next,
    int,
    float,
    chance: (p) => next() < p,
    pick,
    weighted,
    shuffle,
  }
}
