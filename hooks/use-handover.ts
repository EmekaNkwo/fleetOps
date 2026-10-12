"use client"

import { useCallback, useMemo } from "react"
import { REGION_BY_ID } from "@/data/geography"
import { isActiveDeliveryStatus, startOfDay } from "@/lib/calculations"
import { operationsNow } from "@/services/simulation/ops-clock"
import {
  useAlertStore,
  useDeliveryStore,
  useIncidentStore,
  useReferenceStore,
  useVehicleStore,
} from "@/stores"
import type { Alert, Incident } from "@/types"

export interface HandoverLine {
  readonly label: string
  readonly value: string
  readonly tone?: "good" | "warn" | "bad"
}

export interface HandoverSection {
  readonly title: string
  readonly lines: readonly HandoverLine[]
}

export interface HandoverReport {
  readonly generatedAt: number
  readonly sections: readonly HandoverSection[]
  /** Open incidents the incoming shift inherits, worst first. */
  readonly openIncidents: readonly Incident[]
  /** Unresolved critical alerts, worst first. */
  readonly criticalAlerts: readonly Alert[]
  /** Corridors with the most late work, as free text. */
  readonly watchList: readonly string[]
}

export interface UseHandoverResult {
  readonly report: HandoverReport
  /** Opens the browser print dialog against the printable report. */
  print(): void
}

/** How many rows of each list the report carries. */
const LIST_LIMIT = 8

function tone(value: number, warn: number, bad: number): HandoverLine["tone"] {
  if (value >= bad) {
    return "bad"
  }
  return value >= warn ? "warn" : "good"
}

/**
 * The shift handover.
 *
 * Every number on it already exists somewhere in the console; what did not
 * exist was one page that says what the next operator is inheriting. A handover
 * is a different artefact from a dashboard — it is a point-in-time statement,
 * it has to be readable on paper, and it has to lead with what is unresolved
 * rather than with what is healthy.
 */
export function useHandover(): UseHandoverResult {
  const deliveryCounts = useDeliveryStore((state) => state.counts)
  const performance = useDeliveryStore((state) => state.performance)
  const deliveriesById = useDeliveryStore((state) => state.byId)
  const deliveryIds = useDeliveryStore((state) => state.ids)
  const deliveryVersion = useDeliveryStore((state) => state.version)

  const fleetCounts = useVehicleStore((state) => state.counts)

  const incidentsById = useIncidentStore((state) => state.byId)
  const incidentIds = useIncidentStore((state) => state.ids)

  const alertsById = useAlertStore((state) => state.byId)
  const alertIds = useAlertStore((state) => state.ids)

  const routesById = useReferenceStore((state) => state.routesById)

  const report = useMemo<HandoverReport>(() => {
    const generatedAt = operationsNow()
    const dayStart = startOfDay(generatedAt)

    const openIncidents = incidentIds
      .map((id) => incidentsById[id])
      .filter(
        (incident): incident is Incident =>
          incident !== undefined && incident.status !== "RESOLVED"
      )
      .slice(0, LIST_LIMIT)

    const criticalAlerts = alertIds
      .map((id) => alertsById[id])
      .filter(
        (alert): alert is Alert =>
          alert !== undefined &&
          alert.status === "OPEN" &&
          alert.severity === "CRITICAL"
      )
      .slice(0, LIST_LIMIT)

    // Late work per corridor, so the watch list names roads rather than orders.
    const lateByRoute = new Map<string, number>()
    let completedToday = 0
    for (const id of deliveryIds) {
      const delivery = deliveriesById[id]
      if (!delivery) {
        continue
      }
      if (
        delivery.status === "COMPLETED" &&
        delivery.completedAt !== null &&
        delivery.completedAt >= dayStart
      ) {
        completedToday += 1
      }
      if (isActiveDeliveryStatus(delivery.status) && delivery.delayMinutes > 0) {
        lateByRoute.set(
          delivery.routeId,
          (lateByRoute.get(delivery.routeId) ?? 0) + 1
        )
      }
    }

    const watchList = [...lateByRoute.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(
        ([routeId, count]) =>
          `${routesById[routeId]?.name ?? routeId} — ${count} running late`
      )

    const sections: readonly HandoverSection[] = [
      {
        title: "Delivery board",
        lines: [
          { label: "Active", value: String(deliveryCounts.total - completedToday) },
          { label: "In transit", value: String(deliveryCounts.inTransit) },
          {
            label: "Delayed",
            value: String(deliveryCounts.delayed),
            tone: tone(deliveryCounts.delayed, 10, 25),
          },
          {
            label: "At risk",
            value: String(deliveryCounts.atRisk),
            tone: tone(deliveryCounts.atRisk, 5, 15),
          },
          { label: "Completed today", value: String(completedToday) },
          { label: "Cancelled", value: String(deliveryCounts.cancelled) },
        ],
      },
      {
        title: "Service quality",
        lines: [
          {
            label: "On-time rate",
            value: `${Math.round(performance.onTimeRate * 100)}%`,
            tone: performance.onTimeRate >= 0.9 ? "good" : "warn",
          },
          {
            label: "ETA accuracy",
            value: `${Math.round(performance.etaAccuracy * 100)}%`,
            tone: performance.etaAccuracy >= 0.85 ? "good" : "warn",
          },
          {
            label: "Average delay",
            value: `${Math.round(performance.averageDelayMinutes)} min`,
            tone: tone(performance.averageDelayMinutes, 15, 30),
          },
        ],
      },
      {
        title: "Fleet",
        lines: [
          { label: "Total vehicles", value: String(fleetCounts.total) },
          { label: "On route", value: String(fleetCounts.onRoute) },
          { label: "Idle", value: String(fleetCounts.idle) },
          {
            label: "Offline",
            value: String(fleetCounts.offline),
            tone: tone(fleetCounts.offline, 5, 15),
          },
        ],
      },
    ]

    return {
      generatedAt,
      sections,
      openIncidents,
      criticalAlerts,
      watchList,
    }
  }, [
    deliveryCounts,
    performance,
    deliveryIds,
    deliveriesById,
    deliveryVersion,
    fleetCounts,
    incidentIds,
    incidentsById,
    alertIds,
    alertsById,
    routesById,
  ])

  const print = useCallback((): void => {
    if (typeof window !== "undefined") {
      window.print()
    }
  }, [])

  return { report, print }
}

/** Region name for a nullable region, used by the report's incident list. */
export function handoverRegionName(region: string | null): string {
  if (!region) {
    return "Network-wide"
  }
  return REGION_BY_ID[region as keyof typeof REGION_BY_ID]?.name ?? region
}
