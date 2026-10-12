import { create } from "zustand"
import { ALERT_LIMIT } from "@/data/config"
import { SEVERITY_RANK } from "@/lib/status-tokens"
import { preferences } from "@/services/storage/preferences"
import type { Alert, AlertStatus, Severity } from "@/types"

interface AlertState {
  readonly byId: Readonly<Record<string, Alert>>
  /** Ordered newest-and-most-severe first; the panel renders this directly. */
  readonly ids: readonly string[]
  readonly openCount: number
  readonly criticalCount: number
  /**
   * Newest open CRITICAL alert. The notifier watches this instead of
   * subscribing to the bus, which keeps the event stream out of the UI layer.
   */
  readonly latestCriticalId: string | null
  readonly version: number
  replaceAll(alerts: readonly Alert[]): void
  insert(alert: Alert): void
  setStatus(alertId: string, status: AlertStatus, at: number): void
}

/** Severity first, then recency: the queue a dispatcher works top-down. */
function compareAlerts(a: Alert, b: Alert): number {
  const openness = Number(b.status === "OPEN") - Number(a.status === "OPEN")
  if (openness !== 0) {
    return openness
  }
  const severity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
  if (severity !== 0) {
    return severity
  }
  return b.createdAt - a.createdAt
}

function reindex(
  byId: Readonly<Record<string, Alert>>
): Pick<
  AlertState,
  "ids" | "openCount" | "criticalCount" | "latestCriticalId"
> {
  const alerts = Object.values(byId)
  alerts.sort(compareAlerts)

  let openCount = 0
  let criticalCount = 0
  let latestCriticalId: string | null = null
  let latestCriticalAt = -1

  for (const alert of alerts) {
    if (alert.status !== "OPEN") {
      continue
    }
    openCount += 1
    if (alert.severity !== "CRITICAL") {
      continue
    }
    criticalCount += 1
    if (alert.createdAt > latestCriticalAt) {
      latestCriticalAt = alert.createdAt
      latestCriticalId = alert.id
    }
  }

  return {
    ids: alerts.slice(0, ALERT_LIMIT).map((alert) => alert.id),
    openCount,
    criticalCount,
    latestCriticalId,
  }
}

export const useAlertStore = create<AlertState>()((set) => ({
  byId: {},
  ids: [],
  openCount: 0,
  criticalCount: 0,
  latestCriticalId: null,
  version: 0,

  replaceAll: (alerts) => {
    // Acknowledgements survive a reload: they are an operator decision, not
    // simulation state, so they are restored from local preferences.
    const acknowledged = new Set(preferences.loadAcknowledgedAlerts())
    const byId: Record<string, Alert> = {}
    for (const alert of alerts) {
      byId[alert.id] = acknowledged.has(alert.id)
        ? { ...alert, status: "ACKNOWLEDGED" }
        : alert
    }
    set((state) => ({ byId, ...reindex(byId), version: state.version + 1 }))
  },

  insert: (alert) => {
    set((state) => {
      if (state.byId[alert.id]) {
        return state
      }
      const byId = { ...state.byId, [alert.id]: alert }
      // Trim the oldest resolved alerts once the cap is reached.
      const entries = Object.values(byId).sort(compareAlerts)
      if (entries.length > ALERT_LIMIT) {
        for (const stale of entries.slice(ALERT_LIMIT)) {
          delete byId[stale.id]
        }
      }
      return { byId, ...reindex(byId), version: state.version + 1 }
    })
  },

  setStatus: (alertId, status, at) => {
    set((state) => {
      const alert = state.byId[alertId]
      if (!alert || alert.status === status) {
        return state
      }
      const byId = {
        ...state.byId,
        [alertId]: { ...alert, status, updatedAt: at },
      }

      if (status === "ACKNOWLEDGED") {
        const acknowledged = Object.values(byId)
          .filter((entry) => entry.status === "ACKNOWLEDGED")
          .map((entry) => entry.id)
        preferences.saveAcknowledgedAlerts(acknowledged)
      }

      return { byId, ...reindex(byId), version: state.version + 1 }
    })
  },
}))
