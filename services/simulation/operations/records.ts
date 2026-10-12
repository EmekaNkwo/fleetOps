import { MINUTE_MS } from "@/lib/clock"
import type {
  Alert,
  AlertKind,
  Incident,
  IncidentLogEntry,
  IncidentStatus,
  IncidentType,
  RegionId,
  Severity,
} from "@/types"
import { nextAlertId, nextIncidentReference } from "@/services/mock/ids"
import type { Emit } from "../emit"
import type { World } from "../world"

/**
 * Raises an operational alert. Alerts are deduplicated on
 * (kind, vehicle, delivery) while still open, so a vehicle that keeps slipping
 * does not bury the queue under twenty copies of the same warning — the thing
 * that makes real alert centres useless.
 */
export function raiseAlert(
  world: World,
  emit: Emit,
  input: {
    readonly kind: AlertKind
    readonly severity: Severity
    readonly title: string
    readonly message: string
    readonly vehicleId?: string | null
    readonly deliveryId?: string | null
    readonly incidentId?: string | null
    readonly region?: RegionId | null
  }
): Alert | null {
  const now = world.clock.now()

  for (const existing of world.alerts.values()) {
    if (
      existing.kind === input.kind &&
      (existing.status === "OPEN" || existing.status === "ACKNOWLEDGED") &&
      existing.vehicleId === (input.vehicleId ?? null) &&
      existing.deliveryId === (input.deliveryId ?? null)
    ) {
      return null
    }
  }

  const alert: Alert = {
    id: nextAlertId(world.counters),
    kind: input.kind,
    severity: input.severity,
    title: input.title,
    message: input.message,
    status: "OPEN",
    createdAt: now,
    updatedAt: now,
    vehicleId: input.vehicleId ?? null,
    deliveryId: input.deliveryId ?? null,
    incidentId: input.incidentId ?? null,
    region: input.region ?? null,
  }

  world.alerts.set(alert.id, alert)
  emit("alert.raised", { alert })
  return alert
}

export function transitionAlert(
  world: World,
  emit: Emit,
  alertId: string,
  status: Alert["status"]
): Alert | null {
  const alert = world.alerts.get(alertId)
  if (!alert || alert.status === status) {
    return null
  }

  const next: Alert = { ...alert, status, updatedAt: world.clock.now() }
  world.alerts.set(alertId, next)

  switch (status) {
    case "ACKNOWLEDGED":
      emit("alert.acknowledged", { alertId })
      break
    case "DISMISSED":
      emit("alert.dismissed", { alertId })
      break
    case "RESOLVED":
      emit("alert.resolved", { alertId })
      break
    default:
      break
  }

  return next
}

/** Closes any open alerts that name this delivery, used on recovery. */
export function resolveAlertsForDelivery(
  world: World,
  emit: Emit,
  deliveryId: string,
  kinds: readonly AlertKind[]
): void {
  for (const alert of [...world.alerts.values()]) {
    if (
      alert.deliveryId === deliveryId &&
      kinds.includes(alert.kind) &&
      (alert.status === "OPEN" || alert.status === "ACKNOWLEDGED")
    ) {
      transitionAlert(world, emit, alert.id, "RESOLVED")
    }
  }
}

const INCIDENT_SEVERITY: Readonly<Record<IncidentType, Severity>> = {
  TRAFFIC: "WARNING",
  MECHANICAL: "CRITICAL",
  ACCIDENT: "CRITICAL",
  WEATHER: "WARNING",
  SECURITY: "CRITICAL",
  CUSTOMER: "INFO",
}

let incidentSequence = 0

export function createIncident(
  world: World,
  emit: Emit,
  input: {
    readonly type: IncidentType
    readonly title: string
    readonly description: string
    readonly vehicleId?: string | null
    readonly deliveryId?: string | null
    readonly routeId?: string | null
    readonly region?: RegionId | null
    /** Overrides the severity implied by the type. */
    readonly severity?: Severity
    /** Who raised it. Defaults to the monitor, for telemetry-driven incidents. */
    readonly actor?: string
    readonly note?: string
  }
): Incident {
  const now = world.clock.now()
  incidentSequence += 1

  const incident: Incident = {
    id: `incident-live-${incidentSequence}`,
    reference: nextIncidentReference(world.counters),
    type: input.type,
    severity: input.severity ?? INCIDENT_SEVERITY[input.type],
    status: "DETECTED",
    title: input.title,
    description: input.description,
    vehicleId: input.vehicleId ?? null,
    deliveryId: input.deliveryId ?? null,
    routeId: input.routeId ?? null,
    region: input.region ?? null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    assignee: null,
    log: [
      {
        at: now,
        status: "DETECTED",
        // The opening note has to say where the incident came from. A
        // dispatcher reading a board of them needs to tell at a glance which
        // were raised by a person and which by telemetry.
        note: input.note ?? "Raised automatically from fleet telemetry",
        actor: input.actor ?? "FleetOps monitor",
      },
    ],
  }

  world.incidents.set(incident.id, incident)
  emit("incident.created", { incident })
  return incident
}

const INCIDENT_FLOW: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> =
  {
    DETECTED: ["ACKNOWLEDGED", "RESOLVED"],
    ACKNOWLEDGED: ["INVESTIGATING", "RESOLVED"],
    INVESTIGATING: ["RESOLVED"],
    RESOLVED: [],
  }

export function canTransitionIncident(
  from: IncidentStatus,
  to: IncidentStatus
): boolean {
  return INCIDENT_FLOW[from].includes(to)
}

/**
 * Advances an incident through its lifecycle. Illegal transitions are rejected
 * rather than silently applied, so the UI cannot drive the record into a state
 * the process does not allow.
 */
export function transitionIncident(
  world: World,
  emit: Emit,
  input: {
    readonly incidentId: string
    readonly to: IncidentStatus
    readonly note: string
    readonly actor: string
  }
): Incident | null {
  const incident = world.incidents.get(input.incidentId)
  if (!incident || !canTransitionIncident(incident.status, input.to)) {
    return null
  }

  const now = world.clock.now()
  const entry: IncidentLogEntry = {
    at: now,
    status: input.to,
    note: input.note,
    actor: input.actor,
  }

  const next: Incident = {
    ...incident,
    status: input.to,
    updatedAt: now,
    resolvedAt: input.to === "RESOLVED" ? now : incident.resolvedAt,
    log: [...incident.log, entry],
  }

  world.incidents.set(next.id, next)

  const transition = {
    incidentId: next.id,
    from: incident.status,
    to: input.to,
    note: input.note,
    actor: input.actor,
  }

  switch (input.to) {
    case "ACKNOWLEDGED":
      emit("incident.acknowledged", transition)
      break
    case "INVESTIGATING":
      emit("incident.investigating", transition)
      break
    case "RESOLVED":
      emit("incident.resolved", transition)
      break
    default:
      break
  }

  return next
}

export function assignIncident(
  world: World,
  emit: Emit,
  incidentId: string,
  assignee: string
): Incident | null {
  const incident = world.incidents.get(incidentId)
  if (!incident || incident.status === "RESOLVED") {
    return null
  }

  const now = world.clock.now()
  const next: Incident = {
    ...incident,
    assignee,
    updatedAt: now,
    log: [
      ...incident.log,
      {
        at: now,
        status: incident.status,
        note: `Assigned to ${assignee}`,
        actor: assignee,
      },
    ],
  }

  world.incidents.set(incidentId, next)
  emit("incident.assigned", { incidentId, assignee })
  return next
}

/** Minutes a vehicle has been out of contact, for alert copy. */
export function minutesSince(at: number, now: number): number {
  return Math.max(1, Math.round((now - at) / MINUTE_MS))
}
