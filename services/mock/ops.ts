import { DISPATCHERS } from "@/data/people"
import { alertThresholds } from "@/services/simulation/thresholds"
import { MINUTE_MS } from "@/lib/clock"
import { trafficFactor } from "@/lib/calculations"
import type { Rng } from "@/lib/random"
import type {
  ActivityEvent,
  Alert,
  Delivery,
  Driver,
  Incident,
  IncidentStatus,
  IncidentType,
  Route,
  Severity,
  TrafficCondition,
  TrafficLevel,
  Vehicle,
} from "@/types"
import {
  nextActivityId,
  nextAlertId,
  nextIncidentReference,
  type ReferenceCounters,
} from "./ids"

const CONGESTION_NOTES: readonly string[] = [
  "Tanker breakdown narrowing the carriageway",
  "Road works at the toll plaza",
  "Market-day congestion",
  "Articulated vehicle blocking the inside lane",
  "Flooding after heavy rainfall",
  "Security checkpoint queue",
]

const MECHANICAL_NOTES: readonly string[] = [
  "Loss of air pressure on the rear axle",
  "Alternator failure, telemetry unit down",
  "Front tyre blowout",
  "Overheating engine, driver pulled over",
  "Clutch failure",
]

/** Seeds live traffic: most corridors free flowing, a visible minority not. */
export function generateTraffic(
  rng: Rng,
  routes: readonly Route[],
  now: number
): Map<string, TrafficCondition> {
  const conditions = new Map<string, TrafficCondition>()
  const shuffled = rng.shuffle(routes)
  const congested = new Set(shuffled.slice(0, 3).map((route) => route.id))
  const slow = new Set(shuffled.slice(3, 10).map((route) => route.id))

  for (const route of routes) {
    const level: TrafficLevel = congested.has(route.id)
      ? "congested"
      : slow.has(route.id)
        ? "slow"
        : "normal"

    conditions.set(route.id, {
      routeId: route.id,
      level,
      speedFactor: trafficFactor(level),
      since: now - rng.int(4, 90) * MINUTE_MS,
      description:
        level === "normal" ? "Free flowing" : rng.pick(CONGESTION_NOTES),
    })
  }

  return conditions
}

const INCIDENT_SEVERITY: Readonly<Record<IncidentType, Severity>> = {
  TRAFFIC: "WARNING",
  MECHANICAL: "CRITICAL",
  ACCIDENT: "CRITICAL",
  WEATHER: "WARNING",
  SECURITY: "CRITICAL",
  CUSTOMER: "INFO",
}

const INCIDENT_TITLES: Readonly<Record<IncidentType, string>> = {
  TRAFFIC: "Heavy congestion on route",
  MECHANICAL: "Vehicle mechanical failure",
  ACCIDENT: "Road traffic accident",
  WEATHER: "Severe weather affecting route",
  SECURITY: "Security incident reported",
  CUSTOMER: "Customer unavailable at delivery point",
}

function incidentLog(
  rng: Rng,
  status: IncidentStatus,
  createdAt: number,
  assignee: string | null
) {
  const log = [
    {
      at: createdAt,
      status: "DETECTED" as IncidentStatus,
      note: "Raised automatically from fleet telemetry",
      actor: "FleetOps monitor",
    },
  ]

  if (status === "DETECTED") {
    return log
  }

  log.push({
    at: createdAt + rng.int(1, 8) * MINUTE_MS,
    status: "ACKNOWLEDGED",
    note: "Acknowledged by control room",
    actor: assignee ?? "Control room",
  })

  if (status === "ACKNOWLEDGED") {
    return log
  }

  log.push({
    at: createdAt + rng.int(9, 22) * MINUTE_MS,
    status: "INVESTIGATING",
    note: "Driver contacted, awaiting recovery estimate",
    actor: assignee ?? "Control room",
  })

  if (status === "INVESTIGATING") {
    return log
  }

  log.push({
    at: createdAt + rng.int(24, 70) * MINUTE_MS,
    status: "RESOLVED",
    note: "Vehicle back on route, delivery re-sequenced",
    actor: assignee ?? "Control room",
  })

  return log
}

/**
 * Builds the opening incident board from vehicles that are actually in trouble,
 * so every incident on screen can be traced to a real vehicle and delivery.
 */
export function generateIncidents(
  rng: Rng,
  count: number,
  vehicles: readonly Vehicle[],
  deliveries: ReadonlyMap<string, Delivery>,
  routes: ReadonlyMap<string, Route>,
  counters: ReferenceCounters,
  now: number
): Incident[] {
  const troubled = vehicles.filter(
    (vehicle) =>
      vehicle.status === "OFFLINE" ||
      vehicle.status === "DELAYED" ||
      vehicle.status === "AT_RISK"
  )
  const candidates = rng.shuffle(troubled).slice(0, count)
  const statuses: readonly IncidentStatus[] = [
    "DETECTED",
    "DETECTED",
    "ACKNOWLEDGED",
    "INVESTIGATING",
    "INVESTIGATING",
    "RESOLVED",
  ]

  return candidates.map((vehicle, index) => {
    const type: IncidentType =
      vehicle.status === "OFFLINE"
        ? rng.pick<IncidentType>(["MECHANICAL", "SECURITY"])
        : rng.pick<IncidentType>(["TRAFFIC", "TRAFFIC", "WEATHER", "ACCIDENT", "CUSTOMER"])
    const status = statuses[index % statuses.length] ?? "DETECTED"
    const createdAt = now - rng.int(4, 180) * MINUTE_MS
    const assignee =
      status === "DETECTED" ? null : rng.pick(DISPATCHERS)
    const log = incidentLog(rng, status, createdAt, assignee)
    const last = log[log.length - 1]
    const delivery = vehicle.deliveryId
      ? deliveries.get(vehicle.deliveryId)
      : undefined
    const route = vehicle.routeId ? routes.get(vehicle.routeId) : undefined

    return {
      id: `incident-${index}`,
      reference: nextIncidentReference(counters),
      type,
      severity: INCIDENT_SEVERITY[type],
      status,
      title: INCIDENT_TITLES[type],
      description:
        type === "MECHANICAL"
          ? rng.pick(MECHANICAL_NOTES)
          : `${rng.pick(CONGESTION_NOTES)} on ${route?.name ?? "the assigned route"}`,
      vehicleId: vehicle.id,
      deliveryId: delivery?.id ?? null,
      routeId: vehicle.routeId,
      region: route?.destinationRegion ?? vehicle.homeRegion,
      createdAt,
      updatedAt: last?.at ?? createdAt,
      resolvedAt: status === "RESOLVED" ? (last?.at ?? createdAt) : null,
      assignee,
      log,
    }
  })
}

/** Opening alert queue, derived from the same facts a dispatcher would see. */
export function generateAlerts(
  rng: Rng,
  vehicles: readonly Vehicle[],
  deliveries: readonly Delivery[],
  traffic: ReadonlyMap<string, TrafficCondition>,
  routes: ReadonlyMap<string, Route>,
  incidents: readonly Incident[],
  counters: ReferenceCounters,
  now: number
): Alert[] {
  const alerts: Alert[] = []
  const incidentByVehicle = new Map(
    incidents.map((incident) => [incident.vehicleId, incident])
  )

  const push = (alert: Omit<Alert, "id">): void => {
    alerts.push({ ...alert, id: nextAlertId(counters) })
  }

  for (const vehicle of vehicles) {
    if (vehicle.status !== "OFFLINE") {
      continue
    }
    push({
      kind: "VEHICLE_OFFLINE",
      severity: "CRITICAL",
      title: `Vehicle ${vehicle.callSign} offline`,
      message: `No telemetry received for ${Math.max(1, Math.round((now - vehicle.lastSeen) / MINUTE_MS))} minutes`,
      status: "OPEN",
      createdAt: vehicle.lastSeen,
      updatedAt: vehicle.lastSeen,
      vehicleId: vehicle.id,
      deliveryId: vehicle.deliveryId,
      incidentId: incidentByVehicle.get(vehicle.id)?.id ?? null,
      region: vehicle.homeRegion,
    })
  }

  const delayed = deliveries.filter((delivery) => delivery.status === "DELAYED")
  for (const delivery of delayed.slice(0, 9)) {
    const route = routes.get(delivery.routeId)
    push({
      kind: "DELIVERY_DELAYED",
      severity: "WARNING",
      title: `Delivery #${delivery.reference} delayed`,
      message: `Running ${delivery.delayMinutes} minutes behind on ${route?.name ?? "route"}`,
      status: "OPEN",
      createdAt: now - rng.int(1, 40) * MINUTE_MS,
      updatedAt: now,
      vehicleId: delivery.vehicleId,
      deliveryId: delivery.id,
      incidentId: null,
      region: delivery.destinationRegion,
    })
  }

  const atRisk = deliveries.filter((delivery) => delivery.status === "AT_RISK")
  for (const delivery of atRisk.slice(0, 7)) {
    push({
      kind: "ETA_BREACH",
      severity: "INFO",
      title: `Delivery #${delivery.reference} approaching ETA breach`,
      message: `Less than ${alertThresholds().atRiskMinutes} minutes of headroom remaining`,
      status: "OPEN",
      createdAt: now - rng.int(1, 25) * MINUTE_MS,
      updatedAt: now,
      vehicleId: delivery.vehicleId,
      deliveryId: delivery.id,
      incidentId: null,
      region: delivery.destinationRegion,
    })
  }

  for (const condition of traffic.values()) {
    if (condition.level !== "congested") {
      continue
    }
    const route = routes.get(condition.routeId)
    push({
      kind: "TRAFFIC_SPIKE",
      severity: "WARNING",
      title: `Traffic spike on ${route?.name ?? condition.routeId}`,
      message: condition.description,
      status: "OPEN",
      createdAt: condition.since,
      updatedAt: condition.since,
      vehicleId: null,
      deliveryId: null,
      incidentId: null,
      region: route?.destinationRegion ?? null,
    })
  }

  for (const vehicle of vehicles) {
    if (
      vehicle.fuelLevel > alertThresholds().lowFuelPercent ||
      vehicle.status === "OFFLINE"
    ) {
      continue
    }
    push({
      kind: "FUEL_LOW",
      severity: "INFO",
      title: `Vehicle ${vehicle.callSign} low on fuel`,
      message: `Tank at ${vehicle.fuelLevel}% — schedule a refuelling stop`,
      status: "OPEN",
      createdAt: now - rng.int(2, 55) * MINUTE_MS,
      updatedAt: now,
      vehicleId: vehicle.id,
      deliveryId: vehicle.deliveryId,
      incidentId: null,
      region: vehicle.homeRegion,
    })
  }

  return alerts.sort((a, b) => b.createdAt - a.createdAt)
}

/** Backfills the activity stream so the feed is never empty on first paint. */
export function generateActivity(
  rng: Rng,
  count: number,
  vehicles: readonly Vehicle[],
  deliveries: readonly Delivery[],
  drivers: readonly Driver[],
  routes: ReadonlyMap<string, Route>,
  counters: ReferenceCounters,
  now: number
): ActivityEvent[] {
  const completed = deliveries
    .filter((delivery) => delivery.status === "COMPLETED")
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  const active = vehicles.filter((vehicle) => vehicle.status !== "IDLE")
  const events: ActivityEvent[] = []

  for (let index = 0; index < count; index += 1) {
    const at = now - rng.int(5, 2_400) * 1_000
    const roll = rng.weighted([34, 22, 16, 14, 14])

    if (roll === 0 && completed.length > 0) {
      const delivery = rng.pick(completed)
      events.push({
        id: nextActivityId(counters),
        at,
        type: "delivery.completed",
        severity: "INFO",
        message: `Delivery #${delivery.reference} completed`,
        vehicleId: null,
        deliveryId: delivery.id,
      })
      continue
    }

    if (roll === 1 && active.length > 0) {
      const vehicle = rng.pick(active)
      const route = vehicle.routeId ? routes.get(vehicle.routeId) : undefined
      events.push({
        id: nextActivityId(counters),
        at,
        type: "vehicle.location.updated",
        severity: "INFO",
        message: `Vehicle ${vehicle.callSign} reported position on ${route?.name ?? "route"}`,
        vehicleId: vehicle.id,
        deliveryId: vehicle.deliveryId,
      })
      continue
    }

    if (roll === 2) {
      const route = rng.pick([...routes.values()])
      events.push({
        id: nextActivityId(counters),
        at,
        type: "traffic.slow",
        severity: "WARNING",
        message: `Slow moving traffic detected on ${route.name}`,
        vehicleId: null,
        deliveryId: null,
      })
      continue
    }

    if (roll === 3 && active.length > 0) {
      const driver = rng.pick(drivers)
      const vehicle = rng.pick(active)
      events.push({
        id: nextActivityId(counters),
        at,
        type: "vehicle.online",
        severity: "INFO",
        message: `${driver.shortName} signed on to vehicle ${vehicle.callSign}`,
        vehicleId: vehicle.id,
        deliveryId: null,
      })
      continue
    }

    const delivery = deliveries[rng.int(0, deliveries.length - 1)]
    events.push({
      id: nextActivityId(counters),
      at,
      type: "delivery.created",
      severity: "INFO",
      message: delivery
        ? `Delivery #${delivery.reference} created`
        : "Delivery created",
      vehicleId: null,
      deliveryId: delivery?.id ?? null,
    })
  }

  return events.sort((a, b) => b.at - a.at)
}
