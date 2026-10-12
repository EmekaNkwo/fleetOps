import { createClock, type Clock } from "@/lib/clock"

/**
 * The application's shared notion of "now".
 *
 * The console runs on a time-lapse, so `Date.now()` and the operations clock
 * disagree by a growing margin. Mixing them would be a real bug, not a cosmetic
 * one: an ETA stamped on the simulated clock compared against a real-clock
 * "now" drifts further out of agreement every second the session runs.
 *
 * Everything that displays or compares a timestamp reads from here. The engine
 * installs its world clock on initialise and on reset; before that it is a
 * plain wall clock so server rendering and tests behave sensibly.
 */
let active: Clock = createClock(Date.now(), 1)

export function setOperationsClock(clock: Clock): void {
  active = clock
}

export function operationsNow(): number {
  return active.now()
}
