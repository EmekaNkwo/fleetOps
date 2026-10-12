"use client"

import { useCallback, useEffect, useState } from "react"
import { preferences } from "@/services/storage/preferences"
import {
  alertThresholds,
  clampThresholds,
  DEFAULT_THRESHOLDS,
  setAlertThresholds,
  THRESHOLD_LIMITS,
  type AlertThresholds,
} from "@/services/simulation/thresholds"
import { notify } from "@/stores/toast-store"

export interface ThresholdControl {
  readonly key: keyof AlertThresholds
  readonly label: string
  readonly hint: string
  readonly unit: string
  readonly min: number
  readonly max: number
  readonly value: number
  readonly isDefault: boolean
}

export interface UseAlertSettingsResult {
  readonly controls: readonly ThresholdControl[]
  readonly isDefault: boolean
  set(key: keyof AlertThresholds, value: number): void
  reset(): void
}

const COPY: Readonly<
  Record<keyof AlertThresholds, { label: string; hint: string; unit: string }>
> = {
  delayedMinutes: {
    label: "Mark delayed after",
    hint: "Slippage against the promised time before a delivery turns orange.",
    unit: "min",
  },
  atRiskMinutes: {
    label: "Flag at risk under",
    hint: "Headroom left against the promise before a delivery is called at risk.",
    unit: "min",
  },
  etaAccuracyToleranceMinutes: {
    label: "ETA counts as accurate within",
    hint: "Drift from the dispatch estimate still counted as an accurate ETA.",
    unit: "min",
  },
  lowFuelPercent: {
    label: "Raise refuelling alert below",
    hint: "Tank level that opens a refuelling alert and enters the worklist.",
    unit: "%",
  },
}

const ORDER: readonly (keyof AlertThresholds)[] = [
  "delayedMinutes",
  "atRiskMinutes",
  "etaAccuracyToleranceMinutes",
  "lowFuelPercent",
]

/**
 * Alert tuning.
 *
 * These four numbers decide what the console calls late, at risk, accurate and
 * low — the same numbers the status derivation, the KPI cards and the alert
 * rules all read. Changing one here takes effect on the next derivation rather
 * than rewriting history: deliveries already marked delayed stay delayed until
 * the simulation re-evaluates them, which is the honest behaviour. Retroactively
 * restating the board would make the shift's own record unreliable.
 */
export function useAlertSettings(): UseAlertSettingsResult {
  const [thresholds, setThresholds] = useState<AlertThresholds>(
    DEFAULT_THRESHOLDS
  )

  // Hydrated on mount for the same reason saved views are: storage does not
  // exist during prerender.
  useEffect(() => {
    const stored = preferences.loadThresholds()
    setAlertThresholds(stored)
    setThresholds(stored)
  }, [])

  const apply = useCallback((next: AlertThresholds): void => {
    const clamped = clampThresholds(next)
    setAlertThresholds(clamped)
    preferences.saveThresholds(clamped)
    setThresholds(clamped)
  }, [])

  const set = useCallback(
    (key: keyof AlertThresholds, value: number): void => {
      apply({ ...alertThresholds(), [key]: value })
    },
    [apply]
  )

  const reset = useCallback((): void => {
    apply(DEFAULT_THRESHOLDS)
    notify({ tone: "info", message: "Alert thresholds restored to defaults" })
  }, [apply])

  return {
    controls: ORDER.map((key) => ({
      key,
      ...COPY[key],
      ...THRESHOLD_LIMITS[key],
      value: thresholds[key],
      isDefault: thresholds[key] === DEFAULT_THRESHOLDS[key],
    })),
    isDefault: ORDER.every((key) => thresholds[key] === DEFAULT_THRESHOLDS[key]),
    set,
    reset,
  }
}
