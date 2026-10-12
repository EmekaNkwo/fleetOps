import { TIME_SCALE } from "@/data/config"

/**
 * The operations clock. The control centre runs on a time-lapse: one real
 * second advances the world by `TIME_SCALE` simulated seconds, so a 240 km
 * Lagos–Ibadan run completes in a couple of minutes while ETAs, delays and
 * timestamps stay internally consistent in real units (minutes and hours).
 *
 * Pausing the simulation freezes the clock, so a paused world does not silently
 * accrue delay. Every timestamp in the domain is read from here, never from
 * `Date.now()` directly, which keeps the business layer deterministic in tests.
 */
export interface Clock {
  /** Current simulated time in epoch milliseconds. */
  now(): number
  /** Advance by `realMs` of wall-clock time, scaled. Returns the new time. */
  advance(realMs: number): number
  /** Jump the clock without scaling, used when seeding history. */
  set(at: number): void
  readonly scale: number
}

export function createClock(startAt: number, scale: number = TIME_SCALE): Clock {
  let current = startAt

  return {
    now: () => current,
    advance: (realMs) => {
      current += realMs * scale
      return current
    },
    set: (at) => {
      current = at
    },
    scale,
  }
}

export const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000

export function minutesBetween(from: number, to: number): number {
  return (to - from) / MINUTE_MS
}
