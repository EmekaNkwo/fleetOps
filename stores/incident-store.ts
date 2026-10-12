import { create } from "zustand"
import { SEVERITY_RANK } from "@/lib/status-tokens"
import type { Incident, IncidentLogEntry, IncidentStatus } from "@/types"

interface IncidentState {
  readonly byId: Readonly<Record<string, Incident>>
  readonly ids: readonly string[]
  readonly openCount: number
  readonly version: number
  replaceAll(incidents: readonly Incident[]): void
  insert(incident: Incident): void
  applyTransition(input: {
    readonly incidentId: string
    readonly to: IncidentStatus
    readonly note: string
    readonly actor: string
    readonly at: number
  }): void
  applyAssignment(input: {
    readonly incidentId: string
    readonly assignee: string
    readonly at: number
  }): void
}

function compareIncidents(a: Incident, b: Incident): number {
  const openness =
    Number(b.status !== "RESOLVED") - Number(a.status !== "RESOLVED")
  if (openness !== 0) {
    return openness
  }
  const severity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
  if (severity !== 0) {
    return severity
  }
  return b.updatedAt - a.updatedAt
}

function reindex(
  byId: Readonly<Record<string, Incident>>
): Pick<IncidentState, "ids" | "openCount"> {
  const incidents = Object.values(byId).sort(compareIncidents)
  return {
    ids: incidents.map((incident) => incident.id),
    openCount: incidents.filter((incident) => incident.status !== "RESOLVED")
      .length,
  }
}

export const useIncidentStore = create<IncidentState>()((set) => ({
  byId: {},
  ids: [],
  openCount: 0,
  version: 0,

  replaceAll: (incidents) => {
    const byId: Record<string, Incident> = {}
    for (const incident of incidents) {
      byId[incident.id] = incident
    }
    set((state) => ({ byId, ...reindex(byId), version: state.version + 1 }))
  },

  insert: (incident) => {
    set((state) => {
      if (state.byId[incident.id]) {
        return state
      }
      const byId = { ...state.byId, [incident.id]: incident }
      return { byId, ...reindex(byId), version: state.version + 1 }
    })
  },

  applyTransition: ({ incidentId, to, note, actor, at }) => {
    set((state) => {
      const incident = state.byId[incidentId]
      if (!incident || incident.status === to) {
        return state
      }

      const entry: IncidentLogEntry = { at, status: to, note, actor }
      const byId = {
        ...state.byId,
        [incidentId]: {
          ...incident,
          status: to,
          updatedAt: at,
          resolvedAt: to === "RESOLVED" ? at : incident.resolvedAt,
          log: [...incident.log, entry],
        },
      }
      return { byId, ...reindex(byId), version: state.version + 1 }
    })
  },

  applyAssignment: ({ incidentId, assignee, at }) => {
    set((state) => {
      const incident = state.byId[incidentId]
      if (!incident) {
        return state
      }
      const byId = {
        ...state.byId,
        [incidentId]: {
          ...incident,
          assignee,
          updatedAt: at,
          log: [
            ...incident.log,
            {
              at,
              status: incident.status,
              note: `Assigned to ${assignee}`,
              actor: assignee,
            },
          ],
        },
      }
      return { byId, ...reindex(byId), version: state.version + 1 }
    })
  },
}))
