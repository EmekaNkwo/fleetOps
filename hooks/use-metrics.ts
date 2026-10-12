"use client"

import { useMemo } from "react"
import {
  fleetAvailability,
  fleetUtilisation,
} from "@/lib/calculations"
import { formatClock } from "@/lib/formatting"
import { operationsNow } from "@/services/simulation/ops-clock"
import {
  buildTrend,
  useAlertStore,
  useDeliveryStore,
  useIncidentStore,
  useMetricsStore,
  useVehicleStore,
} from "@/stores"
import type { MetricSample, MetricTrend, OperationsMetrics } from "@/types"

export interface KpiDefinition {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly display: string
  readonly trend: MetricTrend | null
  /** Status filter this KPI drills into, when it has one. */
  readonly drilldown?: string
}

export interface UseMetricsResult {
  readonly metrics: OperationsMetrics
  readonly series: readonly MetricSample[]
  readonly kpis: readonly KpiDefinition[]
  readonly baselineLabel: string
}

/**
 * Aggregates the operational picture into the KPI set and the chart series.
 *
 * Everything here is derived from aggregates the stores already maintain, so
 * adding a KPI card costs one object, not another pass over 680 deliveries.
 */
export function useMetrics(): UseMetricsResult {
  const deliveryCounts = useDeliveryStore((state) => state.counts)
  const performance = useDeliveryStore((state) => state.performance)
  const fleetCounts = useVehicleStore((state) => state.counts)
  const openAlerts = useAlertStore((state) => state.openCount)
  const openIncidents = useIncidentStore((state) => state.openCount)
  const series = useMetricsStore((state) => state.series)
  const baseline = useMetricsStore((state) => state.baseline)

  const metrics = useMemo<OperationsMetrics>(() => {
    const active =
      deliveryCounts.assigned +
      deliveryCounts.inTransit +
      deliveryCounts.delayed +
      deliveryCounts.atRisk

    return {
      activeDeliveries: active,
      inTransit: deliveryCounts.inTransit,
      deliveredToday: deliveryCounts.completedToday,
      delayed: deliveryCounts.delayed,
      atRisk: deliveryCounts.atRisk,
      vehiclesOnline: fleetCounts.online,
      vehiclesOffline: fleetCounts.offline,
      etaAccuracy: performance.etaAccuracy,
      onTimeRate: performance.onTimeRate,
      fleetUtilisation: fleetUtilisation(fleetCounts),
      fleetAvailability: fleetAvailability(fleetCounts),
      averageDelayMinutes: performance.averageDelayMinutes,
      averageDeliveryMinutes: performance.averageDeliveryMinutes,
      deliveriesPerHour: performance.deliveriesPerHour,
      openIncidents,
      openAlerts,
    }
  }, [deliveryCounts, fleetCounts, performance, openAlerts, openIncidents])

  const baselineLabel = baseline?.label ?? formatClock(operationsNow())

  const kpis = useMemo<readonly KpiDefinition[]>(() => {
    const since = `since ${baselineLabel}`

    return [
      {
        id: "active",
        label: "Active Deliveries",
        value: metrics.activeDeliveries,
        display: String(metrics.activeDeliveries),
        trend: baseline
          ? buildTrend({
              current: metrics.activeDeliveries,
              previous: baseline.activeDeliveries,
              since,
              higherIsBetter: true,
            })
          : null,
      },
      {
        id: "in-transit",
        label: "In Transit",
        value: metrics.inTransit,
        display: String(metrics.inTransit),
        trend: null,
        drilldown: "IN_TRANSIT",
      },
      {
        id: "delivered",
        label: "Delivered Today",
        value: metrics.deliveredToday,
        display: String(metrics.deliveredToday),
        trend: baseline
          ? buildTrend({
              current: metrics.deliveredToday,
              previous: baseline.completedToday,
              since,
              higherIsBetter: true,
            })
          : null,
        drilldown: "COMPLETED",
      },
      {
        id: "delayed",
        label: "Delayed",
        value: metrics.delayed,
        display: String(metrics.delayed),
        trend: baseline
          ? buildTrend({
              current: metrics.delayed,
              previous: baseline.delayed,
              since,
              higherIsBetter: false,
            })
          : null,
        drilldown: "DELAYED",
      },
      {
        id: "at-risk",
        label: "At Risk",
        value: metrics.atRisk,
        display: String(metrics.atRisk),
        trend: baseline
          ? buildTrend({
              current: metrics.atRisk,
              previous: baseline.atRisk,
              since,
              higherIsBetter: false,
            })
          : null,
        drilldown: "AT_RISK",
      },
      {
        id: "online",
        label: "Vehicles Online",
        value: metrics.vehiclesOnline,
        display: String(metrics.vehiclesOnline),
        trend: null,
      },
      {
        id: "offline",
        label: "Vehicles Offline",
        value: metrics.vehiclesOffline,
        display: String(metrics.vehiclesOffline),
        trend: baseline
          ? buildTrend({
              current: metrics.vehiclesOffline,
              previous: baseline.vehiclesOffline,
              since,
              higherIsBetter: false,
            })
          : null,
      },
      {
        id: "eta-accuracy",
        label: "ETA Accuracy",
        value: metrics.etaAccuracy,
        display: `${Math.round(metrics.etaAccuracy * 100)}%`,
        trend: null,
      },
    ]
  }, [metrics, baseline, baselineLabel])

  return { metrics, series, kpis, baselineLabel }
}
