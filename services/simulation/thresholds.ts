import { THRESHOLDS } from "@/data/config"

export interface AlertThresholds {
  /** A delivery is DELAYED beyond this many minutes of slippage. */
  readonly delayedMinutes: number
  /** Minutes of promised-time headroom below which a delivery is AT_RISK. */
  readonly atRiskMinutes: number
  /** ETA within this many minutes of the dispatch estimate counts as accurate. */
  readonly etaAccuracyToleranceMinutes: number
  /** Fuel percentage that raises a refuelling alert. */
  readonly lowFuelPercent: number
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  delayedMinutes: THRESHOLDS.delayedMinutes,
  atRiskMinutes: THRESHOLDS.atRiskMinutes,
  etaAccuracyToleranceMinutes: THRESHOLDS.etaAccuracyToleranceMinutes,
  lowFuelPercent: THRESHOLDS.lowFuelPercent,
}

/** Bounds every setting, so a malformed stored value cannot break derivation. */
export const THRESHOLD_LIMITS: Readonly<
  Record<keyof AlertThresholds, { readonly min: number; readonly max: number }>
> = {
  delayedMinutes: { min: 1, max: 120 },
  atRiskMinutes: { min: 1, max: 120 },
  etaAccuracyToleranceMinutes: { min: 1, max: 60 },
  lowFuelPercent: { min: 1, max: 60 },
}

export function clampThresholds(
  input: Partial<AlertThresholds>
): AlertThresholds {
  const read = (key: keyof AlertThresholds): number => {
    const value = input[key]
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return DEFAULT_THRESHOLDS[key]
    }
    const { min, max } = THRESHOLD_LIMITS[key]
    return Math.min(max, Math.max(min, Math.round(value)))
  }

  return {
    delayedMinutes: read("delayedMinutes"),
    atRiskMinutes: read("atRiskMinutes"),
    etaAccuracyToleranceMinutes: read("etaAccuracyToleranceMinutes"),
    lowFuelPercent: read("lowFuelPercent"),
  }
}

let current: AlertThresholds = DEFAULT_THRESHOLDS

/**
 * The thresholds the simulation is currently deriving status against.
 *
 * A module-level holder rather than a store, for the same reason the
 * operations clock is one: `lib/calculations` is pure and synchronous and is
 * called from inside the integration loop, where there is no React and no
 * subscription to read from. The UI writes through `setAlertThresholds`; every
 * reader — the status derivation, the fuel alert, the ETA accuracy metric —
 * reads through here, so there is exactly one definition of "late" in the app.
 */
export function alertThresholds(): AlertThresholds {
  return current
}

export function setAlertThresholds(next: AlertThresholds): void {
  current = clampThresholds(next)
}

/** Restores the shipped defaults. Used by the reset control and by tests. */
export function resetAlertThresholds(): void {
  current = DEFAULT_THRESHOLDS
}
