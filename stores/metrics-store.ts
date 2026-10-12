import { create } from "zustand"
import { METRIC_SERIES_LIMIT } from "@/data/config"
import type { MetricSample, MetricTrend, TrendDirection } from "@/types"

export interface MetricBaseline {
  readonly activeDeliveries: number
  readonly delayed: number
  readonly atRisk: number
  readonly vehiclesOffline: number
  readonly completedToday: number
  readonly capturedAt: number
  readonly label: string
}

interface MetricsState {
  readonly series: readonly MetricSample[]
  /** Reference point for the "+12 since 10:00" style deltas on KPI cards. */
  readonly baseline: MetricBaseline | null
  append(sample: MetricSample): void
  setBaseline(baseline: MetricBaseline): void
  reset(): void
}

export const useMetricsStore = create<MetricsState>()((set) => ({
  series: [],
  baseline: null,

  append: (sample) => {
    set((state) => ({
      series: [...state.series, sample].slice(-METRIC_SERIES_LIMIT),
    }))
  },

  setBaseline: (baseline) => {
    set({ baseline })
  },

  reset: () => {
    set({ series: [], baseline: null })
  },
}))

function direction(delta: number): TrendDirection {
  if (delta > 0) {
    return "up"
  }
  return delta < 0 ? "down" : "flat"
}

/**
 * Builds a trend for a KPI card. `higherIsBetter` decides whether an upward
 * move is painted as good or bad — more deliveries is good, more delays is not.
 */
export function buildTrend(input: {
  readonly current: number
  readonly previous: number
  readonly since: string
  readonly higherIsBetter: boolean
}): MetricTrend {
  const delta = input.current - input.previous
  const dir = direction(delta)
  const polarity =
    dir === "flat"
      ? "neutral"
      : (dir === "up") === input.higherIsBetter
        ? "good"
        : "bad"

  return { direction: dir, delta, polarity, since: input.since }
}
