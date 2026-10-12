"use client"

import { useCallback, useMemo } from "react"
import { simulationEngine } from "@/services/simulation"
import { useAlertStore, useUiStore } from "@/stores"
import type { Alert, Severity, SeverityFilter } from "@/types"

export interface UseAlertsResult {
  readonly alerts: readonly Alert[]
  readonly visibleAlerts: readonly Alert[]
  readonly openCount: number
  readonly criticalCount: number
  readonly severityFilter: SeverityFilter
  readonly countsBySeverity: Readonly<Record<Severity, number>>
  setSeverityFilter(severity: SeverityFilter): void
  acknowledge(alertId: string): void
  dismiss(alertId: string): void
  resolve(alertId: string): void
  acknowledgeAll(): void
  /** Opens the thing an alert is about — vehicle, delivery or incident. */
  inspect(alert: Alert): void
}

/**
 * Alert centre logic: prioritisation, filtering and the acknowledge/dismiss/
 * resolve commands. Commands go to the engine rather than mutating the store,
 * so the resulting events flow back through the same path as simulated ones and
 * land in the activity feed exactly like them.
 */
export function useAlerts(): UseAlertsResult {
  const byId = useAlertStore((state) => state.byId)
  const ids = useAlertStore((state) => state.ids)
  const openCount = useAlertStore((state) => state.openCount)
  const criticalCount = useAlertStore((state) => state.criticalCount)
  const version = useAlertStore((state) => state.version)

  const severityFilter = useUiStore((state) => state.alertSeverityFilter)
  const setSeverityFilter = useUiStore((state) => state.setAlertSeverityFilter)
  const selectVehicle = useUiStore((state) => state.focusVehicleOnMap)
  const selectDelivery = useUiStore((state) => state.selectDelivery)
  const selectIncident = useUiStore((state) => state.selectIncident)
  const openPanel = useUiStore((state) => state.openPanel)

  const alerts = useMemo(
    () =>
      ids
        .map((id) => byId[id])
        .filter((alert): alert is Alert => alert !== undefined),
    [ids, byId, version]
  )

  const visibleAlerts = useMemo(
    () =>
      severityFilter === "ALL"
        ? alerts.filter((alert) => alert.status !== "DISMISSED")
        : alerts.filter(
            (alert) =>
              alert.severity === severityFilter && alert.status !== "DISMISSED"
          ),
    [alerts, severityFilter]
  )

  const countsBySeverity = useMemo(() => {
    const counts: Record<Severity, number> = { INFO: 0, WARNING: 0, CRITICAL: 0 }
    for (const alert of alerts) {
      if (alert.status === "OPEN" || alert.status === "ACKNOWLEDGED") {
        counts[alert.severity] += 1
      }
    }
    return counts
  }, [alerts])

  const inspect = useCallback(
    (alert: Alert): void => {
      if (alert.incidentId) {
        selectIncident(alert.incidentId)
        openPanel("incidents")
        return
      }
      if (alert.vehicleId) {
        selectVehicle(alert.vehicleId)
        return
      }
      if (alert.deliveryId) {
        selectDelivery(alert.deliveryId)
      }
    },
    [openPanel, selectDelivery, selectIncident, selectVehicle]
  )

  const acknowledgeAll = useCallback((): void => {
    for (const alert of alerts) {
      if (alert.status === "OPEN") {
        simulationEngine.acknowledgeAlert(alert.id)
      }
    }
  }, [alerts])

  return {
    alerts,
    visibleAlerts,
    openCount,
    criticalCount,
    severityFilter,
    countsBySeverity,
    setSeverityFilter,
    acknowledge: (alertId) => {
      simulationEngine.acknowledgeAlert(alertId)
    },
    dismiss: (alertId) => {
      simulationEngine.dismissAlert(alertId)
    },
    resolve: (alertId) => {
      simulationEngine.resolveAlert(alertId)
    },
    acknowledgeAll,
    inspect,
  }
}
