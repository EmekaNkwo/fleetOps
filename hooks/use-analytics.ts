"use client"

import { useMemo } from "react"
import { REGIONS, REGION_BY_ID } from "@/data/geography"
import { MINUTE_MS } from "@/lib/clock"
import { isActiveDeliveryStatus, isInFlightDeliveryStatus } from "@/lib/calculations"
import { operationsNow } from "@/services/simulation/ops-clock"
import {
  useDeliveryStore,
  useMetricsStore,
  useReferenceStore,
  useVehicleStore,
} from "@/stores"
import { useWorkspaceStore, type AnalyticsRange } from "@/stores/workspace-store"
import type { MetricSample } from "@/types"

export type AnalyticsDimension = "region" | "corridor"

export interface BreakdownRow {
  readonly id: string
  readonly label: string
  readonly active: number
  readonly delayed: number
  readonly completed: number
  readonly vehicles: number
  /** Share of this group's finished work that arrived on time, 0–1. */
  readonly onTimeRate: number
  readonly averageDelayMinutes: number
}

export interface UseAnalyticsResult {
  readonly series: readonly MetricSample[]
  readonly range: AnalyticsRange
  readonly ranges: readonly {
    readonly id: AnalyticsRange
    readonly label: string
  }[]
  readonly dimension: AnalyticsDimension
  readonly breakdown: readonly BreakdownRow[]
  /** True when the chosen window holds too few samples to plot. */
  readonly sparse: boolean
  setRange(range: AnalyticsRange): void
  setDimension(dimension: AnalyticsDimension): void
}

const RANGES = [
  { id: "15m" as const, label: "15 min" },
  { id: "1h" as const, label: "1 hour" },
  { id: "session" as const, label: "Session" },
]

/** Simulated milliseconds each window covers. `session` keeps everything. */
const WINDOW_MS: Readonly<Record<AnalyticsRange, number | null>> = {
  "15m": 15 * MINUTE_MS,
  "1h": 60 * MINUTE_MS,
  session: null,
}

/** How many rows the breakdown shows before it stops being readable. */
const BREAKDOWN_LIMIT = 10

/**
 * Analytics with dimensions.
 *
 * The charts were fleet-wide totals, which answer "is the operation healthy"
 * but never "where is it unhealthy". Those are different questions and the
 * second is the actionable one — a 91% on-time rate hides a corridor running
 * at 60%. The breakdown groups the same live records by region or by corridor
 * so the average stops concealing its own worst case.
 *
 * The window is applied to the rolling series in simulated time, which is what
 * the samples are stamped with. Using wall-clock here would make "last 15
 * minutes" mean a quarter of an hour of the operator's day and about a day of
 * the fleet's, at the ×90 clock.
 */
export function useAnalytics(): UseAnalyticsResult {
  const allSamples = useMetricsStore((state) => state.series)

  const deliveriesById = useDeliveryStore((state) => state.byId)
  const deliveryIds = useDeliveryStore((state) => state.ids)
  const deliveryVersion = useDeliveryStore((state) => state.version)

  const vehiclesById = useVehicleStore((state) => state.byId)
  const vehicleIds = useVehicleStore((state) => state.ids)
  const vehicleVersion = useVehicleStore((state) => state.version)

  const routesById = useReferenceStore((state) => state.routesById)

  const range = useWorkspaceStore((state) => state.analyticsRange)
  const dimension = useWorkspaceStore((state) => state.analyticsDimension)
  const setRange = useWorkspaceStore((state) => state.setAnalyticsRange)
  const setDimension = useWorkspaceStore((state) => state.setAnalyticsDimension)

  const series = useMemo(() => {
    const window = WINDOW_MS[range]
    if (window === null) {
      return allSamples
    }
    const cutoff = operationsNow() - window
    return allSamples.filter((sample) => sample.at >= cutoff)
  }, [allSamples, range])

  const breakdown = useMemo<readonly BreakdownRow[]>(() => {
    interface Bucket {
      label: string
      active: number
      delayed: number
      completed: number
      onTime: number
      delaySum: number
      delayCount: number
      vehicles: number
    }

    const buckets = new Map<string, Bucket>()
    const bucketFor = (id: string, label: string): Bucket => {
      const existing = buckets.get(id)
      if (existing) {
        return existing
      }
      const created: Bucket = {
        label,
        active: 0,
        delayed: 0,
        completed: 0,
        onTime: 0,
        delaySum: 0,
        delayCount: 0,
        vehicles: 0,
      }
      buckets.set(id, created)
      return created
    }

    // Regions are seeded so an idle one still appears, at zero. A region that
    // vanishes from the chart reads as missing data rather than as quiet.
    if (dimension === "region") {
      for (const region of REGIONS) {
        bucketFor(region.id, region.name)
      }
    }

    const cutoff = (() => {
      const window = WINDOW_MS[range]
      return window === null ? null : operationsNow() - window
    })()

    for (const id of deliveryIds) {
      const delivery = deliveriesById[id]
      if (!delivery) {
        continue
      }

      const key =
        dimension === "region"
          ? delivery.destinationRegion
          : delivery.routeId
      const label =
        dimension === "region"
          ? (REGION_BY_ID[delivery.destinationRegion]?.name ??
            delivery.destinationRegion)
          : (routesById[delivery.routeId]?.name ?? delivery.routeId)

      const bucket = bucketFor(key, label)

      if (isActiveDeliveryStatus(delivery.status)) {
        bucket.active += 1
        if (isInFlightDeliveryStatus(delivery.status) && delivery.delayMinutes > 0) {
          bucket.delayed += 1
        }
        bucket.delaySum += delivery.delayMinutes
        bucket.delayCount += 1
        continue
      }

      // Closed work only counts toward the on-time rate if it closed inside
      // the chosen window, so the figure tracks the window the operator picked.
      if (
        delivery.status === "COMPLETED" &&
        delivery.completedAt !== null &&
        (cutoff === null || delivery.completedAt >= cutoff)
      ) {
        bucket.completed += 1
        if (delivery.completedAt <= delivery.promisedAt) {
          bucket.onTime += 1
        }
      }
    }

    for (const id of vehicleIds) {
      const vehicle = vehiclesById[id]
      if (!vehicle) {
        continue
      }
      if (dimension === "region") {
        const bucket = buckets.get(vehicle.homeRegion)
        if (bucket) {
          bucket.vehicles += 1
        }
      } else if (vehicle.routeId) {
        const bucket = buckets.get(vehicle.routeId)
        if (bucket) {
          bucket.vehicles += 1
        }
      }
    }

    const rows: BreakdownRow[] = [...buckets.entries()].map(([id, bucket]) => ({
      id,
      label: bucket.label,
      active: bucket.active,
      delayed: bucket.delayed,
      completed: bucket.completed,
      vehicles: bucket.vehicles,
      onTimeRate: bucket.completed === 0 ? 1 : bucket.onTime / bucket.completed,
      averageDelayMinutes:
        bucket.delayCount === 0 ? 0 : bucket.delaySum / bucket.delayCount,
    }))

    // Busiest first — the groups carrying the most work are the ones whose
    // on-time rate actually moves the fleet-wide number.
    rows.sort((a, b) => b.active + b.completed - (a.active + a.completed))
    return rows.slice(0, BREAKDOWN_LIMIT)
  }, [
    dimension,
    range,
    deliveryIds,
    deliveriesById,
    deliveryVersion,
    vehicleIds,
    vehiclesById,
    vehicleVersion,
    routesById,
  ])

  return {
    series,
    range,
    ranges: RANGES,
    dimension,
    breakdown,
    sparse: series.length < 2,
    setRange,
    setDimension,
  }
}
