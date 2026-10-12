"use client"

import { useCallback, useMemo } from "react"
import { DISPATCHERS } from "@/data/people"
import { canTransitionIncident } from "@/services/simulation/operations"
import { simulationEngine } from "@/services/simulation"
import {
  useIncidentStore,
  useReferenceStore,
  useUiStore,
  useVehicleStore,
} from "@/stores"
import { notify } from "@/stores/toast-store"
import type {
  Incident,
  IncidentStatus,
  IncidentType,
  RegionId,
  Route,
  Severity,
  Vehicle,
} from "@/types"

export interface IncidentDetail {
  readonly incident: Incident
  readonly vehicle: Vehicle | null
  readonly route: Route | null
  /** Transitions the lifecycle currently allows, for enabling the buttons. */
  readonly allowedTransitions: readonly IncidentStatus[]
}

export interface UseIncidentsResult {
  readonly incidents: readonly Incident[]
  readonly openIncidents: readonly Incident[]
  readonly openCount: number
  readonly selectedIncident: IncidentDetail | null
  readonly assignees: readonly string[]
  select(incidentId: string): void
  clearSelection(): void
  acknowledge(incidentId: string): void
  investigate(incidentId: string): void
  resolve(incidentId: string): void
  assign(incidentId: string, assignee: string): void
  getDetail(incidentId: string): IncidentDetail | null
  /** Opens an incident by hand and selects it. */
  raise(input: RaiseIncidentInput): void
}

/** The operator-supplied half of a manual incident. */
export interface RaiseIncidentInput {
  readonly type: IncidentType
  readonly severity: Severity
  readonly title: string
  readonly description: string
  readonly vehicleId?: string | null
  readonly region?: RegionId | null
  readonly actor: string
}

const ALL_STATUSES: readonly IncidentStatus[] = [
  "DETECTED",
  "ACKNOWLEDGED",
  "INVESTIGATING",
  "RESOLVED",
]

/**
 * Incident management logic. The lifecycle rules live in the simulation's
 * operations module and are reused here to decide which actions are offered —
 * the panel never hard-codes "you can only resolve after acknowledging".
 */
export function useIncidents(): UseIncidentsResult {
  const byId = useIncidentStore((state) => state.byId)
  const ids = useIncidentStore((state) => state.ids)
  const openCount = useIncidentStore((state) => state.openCount)
  const version = useIncidentStore((state) => state.version)

  const vehiclesById = useVehicleStore((state) => state.byId)
  const routesById = useReferenceStore((state) => state.routesById)

  const selection = useUiStore((state) => state.selection)
  const selectIncident = useUiStore((state) => state.selectIncident)
  const clearSelection = useUiStore((state) => state.clearSelection)

  const incidents = useMemo(
    () =>
      ids
        .map((id) => byId[id])
        .filter((incident): incident is Incident => incident !== undefined),
    [ids, byId, version]
  )

  const openIncidents = useMemo(
    () => incidents.filter((incident) => incident.status !== "RESOLVED"),
    [incidents]
  )

  const getDetail = useCallback(
    (incidentId: string): IncidentDetail | null => {
      const incident = byId[incidentId]
      if (!incident) {
        return null
      }
      return {
        incident,
        vehicle: incident.vehicleId
          ? (vehiclesById[incident.vehicleId] ?? null)
          : null,
        route: incident.routeId ? (routesById[incident.routeId] ?? null) : null,
        allowedTransitions: ALL_STATUSES.filter((status) =>
          canTransitionIncident(incident.status, status)
        ),
      }
    },
    [byId, vehiclesById, routesById]
  )

  const selectedIncidentId =
    selection?.kind === "incident" ? selection.id : null

  const selectedIncident = useMemo(
    () => (selectedIncidentId ? getDetail(selectedIncidentId) : null),
    [selectedIncidentId, getDetail]
  )

  return {
    incidents,
    openIncidents,
    openCount,
    selectedIncident,
    assignees: DISPATCHERS,
    select: selectIncident,
    clearSelection,
    acknowledge: (incidentId) => {
      simulationEngine.acknowledgeIncident(incidentId)
    },
    investigate: (incidentId) => {
      simulationEngine.investigateIncident(incidentId)
    },
    resolve: (incidentId) => {
      simulationEngine.resolveIncident(incidentId)
    },
    assign: (incidentId, assignee) => {
      simulationEngine.assignIncidentTo(incidentId, assignee)
    },
    getDetail,
    raise: (input) => {
      const created = simulationEngine.raiseIncident(input)
      if (!created) {
        notify({
          tone: "error",
          message: "Could not open the incident",
          detail: "The simulation is not running.",
        })
        return
      }

      // Selecting it expands the new incident in the board, so the operator
      // lands on the record they just opened rather than hunting for it.
      selectIncident(created)
      notify({
        tone: "success",
        message: "Incident opened",
        detail: input.title,
      })
    },
  }
}
