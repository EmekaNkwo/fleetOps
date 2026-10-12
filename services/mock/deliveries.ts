import { HOUR_MS, MINUTE_MS } from "@/lib/clock"
import {
  delayFromEta,
  effectiveSpeed,
  etaFromRemaining,
  hoursRemaining,
  startOfDay,
} from "@/lib/calculations"
import type { Rng } from "@/lib/random"
import { resolveProgress } from "@/lib/routing"
import { timelineEntry } from "@/lib/timeline"
import type {
  Customer,
  Delivery,
  DeliveryPriority,
  DeliveryStatus,
  Driver,
  Route,
  TimelineEntry,
  TrafficCondition,
  Vehicle,
} from "@/types"
import type { VehicleKinematics } from "@/services/simulation/world"
import type { GeneratedVehicle } from "./fleet"
import { deliveryId, nextDeliveryReference, type ReferenceCounters } from "./ids"

/**
 * The opening board. Numbers are chosen so the control centre starts in a state
 * worth looking at: a large healthy in-transit population, a visible at-risk
 * tail, a handful of hard delays and a few disconnected trucks.
 */
const ACTIVE_MIX: readonly { status: DeliveryStatus; count: number }[] = [
  { status: "IN_TRANSIT", count: 247 },
  { status: "AT_RISK", count: 86 },
  { status: "DELAYED", count: 28 },
  { status: "ASSIGNED", count: 56 },
  { status: "PENDING", count: 78 },
  { status: "CANCELLED", count: 5 },
]

const OFFLINE_VEHICLES = 4

const PRIORITY_WEIGHTS: readonly { priority: DeliveryPriority; weight: number }[] =
  [
    { priority: "STANDARD", weight: 62 },
    { priority: "EXPRESS", weight: 30 },
    { priority: "CRITICAL", weight: 8 },
  ]

export interface DeliveryGenerationInput {
  readonly rng: Rng
  readonly routes: readonly Route[]
  readonly fleet: readonly GeneratedVehicle[]
  readonly drivers: readonly Driver[]
  readonly customers: readonly Customer[]
  readonly traffic: ReadonlyMap<string, TrafficCondition>
  readonly counters: ReferenceCounters
  readonly now: number
  readonly completedBacklog: number
}

export interface DeliveryGenerationResult {
  readonly deliveries: Delivery[]
  readonly vehicles: Vehicle[]
  readonly kinematics: VehicleKinematics[]
}

function pickPriority(rng: Rng): DeliveryPriority {
  const index = rng.weighted(PRIORITY_WEIGHTS.map((entry) => entry.weight))
  return PRIORITY_WEIGHTS[index]?.priority ?? "STANDARD"
}

/**
 * Promised time is reverse-engineered from the target status: that way the
 * generated board is internally consistent with `deriveDeliveryStatus`, and the
 * same rules that classify it at startup keep classifying it during the run.
 */
function promisedFromStatus(
  rng: Rng,
  status: DeliveryStatus,
  etaAt: number
): number {
  switch (status) {
    case "DELAYED":
      return etaAt - rng.int(18, 95) * MINUTE_MS
    case "AT_RISK":
      return etaAt + rng.int(2, 18) * MINUTE_MS
    default:
      return etaAt + rng.int(28, 190) * MINUTE_MS
  }
}

function buildInFlightTimeline(input: {
  readonly rng: Rng
  readonly status: DeliveryStatus
  readonly createdAt: number
  readonly startedAt: number
  readonly etaAt: number
  readonly route: Route
  readonly travelledKm: number
}): TimelineEntry[] {
  const { rng, status, createdAt, startedAt, etaAt, route, travelledKm } = input
  const entries: TimelineEntry[] = [
    timelineEntry({
      kind: "pickup",
      label: "Pickup confirmed",
      at: createdAt,
      detail: route.origin.name,
    }),
    timelineEntry({
      kind: "departed",
      label: "Vehicle departed",
      at: startedAt,
      detail: `${route.origin.name} → ${route.destination.name}`,
    }),
  ]

  const progress = resolveProgress(route, travelledKm)
  const passed = route.legs
    .filter((leg) => leg.offsetKm + leg.distanceKm <= travelledKm)
    .slice(-2)

  for (const leg of passed) {
    entries.push(
      timelineEntry({
        kind: "in_transit",
        label: `Passed ${leg.to.name}`,
        at: startedAt + (leg.offsetKm / route.totalDistanceKm) * (etaAt - startedAt),
      })
    )
  }

  if (status === "DELAYED" || status === "AT_RISK") {
    entries.push(
      timelineEntry({
        kind: "traffic",
        label: "Traffic detected",
        at: startedAt + rng.int(10, 60) * MINUTE_MS,
        detail: `Slow moving traffic on ${route.name}`,
      }),
      timelineEntry({
        kind: "eta_revised",
        label: "ETA revised",
        at: startedAt + rng.int(62, 110) * MINUTE_MS,
        detail: `Pushed back by ${rng.int(12, 70)} minutes`,
      })
    )
  }

  entries.push(
    timelineEntry({
      kind: "in_transit",
      label: progress.nextWaypoint
        ? `In transit towards ${progress.nextWaypoint.name}`
        : "In transit",
      at: input.startedAt + Math.max(1, (etaAt - startedAt) * progress.fraction),
      state: "active",
    }),
    timelineEntry({
      kind: "arrival",
      label: "Arrival at destination",
      at: etaAt,
      detail: route.destination.name,
      state: "upcoming",
    })
  )

  return entries
}

function buildCompletedTimeline(input: {
  readonly route: Route
  readonly createdAt: number
  readonly startedAt: number
  readonly completedAt: number
  readonly onTime: boolean
}): TimelineEntry[] {
  const { route, createdAt, startedAt, completedAt, onTime } = input
  const entries: TimelineEntry[] = [
    timelineEntry({ kind: "pickup", label: "Pickup confirmed", at: createdAt }),
    timelineEntry({
      kind: "departed",
      label: "Vehicle departed",
      at: startedAt,
      detail: route.origin.name,
    }),
  ]

  if (!onTime) {
    entries.push(
      timelineEntry({
        kind: "delay",
        label: "Delay recorded",
        at: startedAt + (completedAt - startedAt) * 0.55,
        detail: "Congestion en route",
      })
    )
  }

  entries.push(
    timelineEntry({
      kind: "arrival",
      label: "Delivered",
      at: completedAt,
      detail: route.destination.name,
    })
  )

  return entries
}

/**
 * Generates the delivery board and binds it to the fleet. Vehicles are consumed
 * from the front of a shuffled pool so the assignment is deterministic for a
 * given seed but not correlated with vehicle id ordering.
 */
export function generateDeliveries(
  input: DeliveryGenerationInput
): DeliveryGenerationResult {
  const { rng, routes, fleet, drivers, customers, traffic, counters, now } = input

  const vehicles = new Map(fleet.map((entry) => [entry.vehicle.id, entry.vehicle]))
  const kinematics = new Map(
    fleet.map((entry) => [entry.kinematics.vehicleId, entry.kinematics])
  )
  // A fleet can be smaller than the board asks for (the tests generate small
  // worlds). When the pool runs dry the delivery falls back to PENDING rather
  // than claiming to be in transit with no truck under it — an inconsistent
  // board would make every downstream assertion meaningless.
  const pool = rng.shuffle(fleet.map((entry) => entry.vehicle.id))
  let poolCursor = 0
  const takeVehicle = (): string | null => {
    const id = pool[poolCursor]
    if (id === undefined) {
      return null
    }
    poolCursor += 1
    return id
  }

  // Leave a few trucks parked so new orders always have something to assign.
  const reserve = Math.max(1, Math.floor(fleet.length * 0.05))
  const assignable = Math.max(0, fleet.length - reserve)

  // The mix above is written for the full fleet. Scaling it keeps the board
  // representative at any size — a small world generated for a test still has
  // delayed deliveries, offline trucks and therefore incidents, rather than
  // being 100% in-transit because the first bucket ate every vehicle.
  const crewed = ACTIVE_MIX.filter(
    (bucket) => bucket.status !== "PENDING" && bucket.status !== "CANCELLED"
  ).reduce((sum, bucket) => sum + bucket.count, 0)
  const scale = crewed === 0 ? 1 : Math.min(1, assignable / crewed)
  const scaled = ACTIVE_MIX.map((bucket) => ({
    status: bucket.status,
    count:
      scale >= 1 ? bucket.count : Math.max(1, Math.round(bucket.count * scale)),
  }))

  const deliveries: Delivery[] = []
  let offlineAssigned = 0

  for (const bucket of scaled) {
    for (let index = 0; index < bucket.count; index += 1) {
      const route = rng.pick(routes)
      const customer = rng.pick(customers)
      const reference = nextDeliveryReference(counters)
      const condition = traffic.get(route.id)
      const level = condition?.level ?? "normal"

      const wantsVehicle =
        bucket.status !== "PENDING" &&
        bucket.status !== "CANCELLED" &&
        poolCursor < assignable
      const vehicleIdForDelivery = wantsVehicle ? takeVehicle() : null
      const vehicle = vehicleIdForDelivery
        ? vehicles.get(vehicleIdForDelivery)
        : undefined
      const driverIdForDelivery = vehicle?.driverId ?? null

      // Without a vehicle the delivery can only be waiting for dispatch.
      const status: DeliveryStatus =
        bucket.status !== "PENDING" &&
        bucket.status !== "CANCELLED" &&
        !vehicle
          ? "PENDING"
          : bucket.status

      const inFlight =
        status === "IN_TRANSIT" || status === "AT_RISK" || status === "DELAYED"
      const fraction = inFlight ? rng.float(0.06, 0.92) : 0
      const travelledKm = route.totalDistanceKm * fraction
      const remainingKm = route.totalDistanceKm - travelledKm
      const jitter = vehicle ? (kinematics.get(vehicle.id)?.jitter ?? 0) : 0
      const speed = effectiveSpeed(route.freeFlowSpeed, level, jitter)

      const etaAt = etaFromRemaining(now, remainingKm, speed)
      const promisedAt = promisedFromStatus(rng, status, etaAt)
      const elapsedMs = inFlight
        ? hoursRemaining(travelledKm, speed) * HOUR_MS
        : 0
      const startedAt = inFlight ? now - elapsedMs : null
      const createdAt =
        (startedAt ?? now) - rng.int(12, 180) * MINUTE_MS

      const progress = resolveProgress(route, travelledKm)
      const timeline: TimelineEntry[] = inFlight
        ? buildInFlightTimeline({
            rng,
            status,
            createdAt,
            startedAt: startedAt ?? now,
            etaAt,
            route,
            travelledKm,
          })
        : status === "CANCELLED"
          ? [
              timelineEntry({ kind: "created", label: "Order received", at: createdAt }),
              timelineEntry({
                kind: "cancelled",
                label: "Cancelled by customer",
                at: createdAt + rng.int(5, 40) * MINUTE_MS,
              }),
            ]
          : [
              timelineEntry({ kind: "created", label: "Order received", at: createdAt }),
              ...(status === "ASSIGNED"
                ? [
                    timelineEntry({
                      kind: "assigned",
                      label: "Vehicle assigned",
                      at: createdAt + rng.int(3, 25) * MINUTE_MS,
                      detail: vehicle ? `Vehicle ${vehicle.callSign}` : undefined,
                      state: "active",
                    }),
                  ]
                : []),
              timelineEntry({
                kind: "pickup",
                label: "Awaiting pickup",
                at: createdAt + rng.int(30, 120) * MINUTE_MS,
                detail: route.origin.name,
                state: "upcoming",
              }),
            ]

      deliveries.push({
        id: deliveryId(reference),
        reference,
        status,
        priority: pickPriority(rng),
        customerId: customer.id,
        vehicleId: vehicleIdForDelivery,
        driverId: driverIdForDelivery,
        routeId: route.id,
        originRegion: route.originRegion,
        destinationRegion: route.destinationRegion,
        weightKg: rng.int(120, 24_000),
        createdAt,
        startedAt,
        completedAt: null,
        promisedAt,
        etaAt,
        originalEtaAt:
          status === "IN_TRANSIT"
            ? etaAt - rng.int(0, 9) * MINUTE_MS
            : etaAt - rng.int(14, 70) * MINUTE_MS,
        delayMinutes: delayFromEta(etaAt, promisedAt),
        progressFraction: progress.fraction,
        remainingKm,
        timeline,
      })

      if (!vehicle) {
        continue
      }

      // Bind the vehicle to the delivery and place it on the route.
      const goOffline =
        status === "DELAYED" && offlineAssigned < OFFLINE_VEHICLES
      if (goOffline) {
        offlineAssigned += 1
      }

      vehicles.set(vehicle.id, {
        ...vehicle,
        status: goOffline
          ? "OFFLINE"
          : status === "DELAYED"
            ? "DELAYED"
            : status === "AT_RISK"
              ? "AT_RISK"
              : status === "ASSIGNED"
                ? "IDLE"
                : "ON_ROUTE",
        location: progress.position,
        heading: progress.bearing,
        speed: goOffline || !inFlight ? 0 : speed,
        routeId: route.id,
        deliveryId: deliveryId(reference),
        homeRegion: route.originRegion,
        lastSeen: goOffline ? now - rng.int(3, 18) * MINUTE_MS : now,
      })

      const kin = kinematics.get(vehicle.id)
      if (kin) {
        kinematics.set(vehicle.id, {
          ...kin,
          routeId: route.id,
          travelledKm,
          speed: goOffline || !inFlight ? 0 : speed,
          heading: progress.bearing,
          offlineUntil: goOffline ? now + rng.int(6, 30) * MINUTE_MS : null,
          stoppedUntil: null,
        })
      }
    }
  }

  // Historic deliveries. These seed the performance metrics so the charts and
  // on-time rate are populated before the simulation emits anything.
  const dayStart = startOfDay(now)
  const backlogWindow = Math.max(HOUR_MS, Math.min(10 * HOUR_MS, now - dayStart))

  for (let index = 0; index < input.completedBacklog; index += 1) {
    const route = rng.pick(routes)
    const customer = rng.pick(customers)
    const driver = rng.pick(drivers)
    const reference = nextDeliveryReference(counters)
    const completedAt = now - rng.float(MINUTE_MS, backlogWindow)
    const durationMs =
      (route.totalDistanceKm / route.freeFlowSpeed) * HOUR_MS * rng.float(1, 1.5)
    const startedAt = completedAt - durationMs
    const createdAt = startedAt - rng.int(10, 90) * MINUTE_MS
    const onTime = rng.chance(0.88)
    const promisedAt = onTime
      ? completedAt + rng.int(4, 65) * MINUTE_MS
      : completedAt - rng.int(6, 70) * MINUTE_MS

    deliveries.push({
      id: deliveryId(reference),
      reference,
      status: "COMPLETED",
      priority: pickPriority(rng),
      customerId: customer.id,
      vehicleId: null,
      driverId: driver.id,
      routeId: route.id,
      originRegion: route.originRegion,
      destinationRegion: route.destinationRegion,
      weightKg: rng.int(120, 24_000),
      createdAt,
      startedAt,
      completedAt,
      promisedAt,
      etaAt: completedAt,
      originalEtaAt: promisedAt - rng.int(0, 25) * MINUTE_MS,
      delayMinutes: onTime ? 0 : delayFromEta(completedAt, promisedAt),
      progressFraction: 1,
      remainingKm: 0,
      timeline: buildCompletedTimeline({
        route,
        createdAt,
        startedAt,
        completedAt,
        onTime,
      }),
    })
  }

  return {
    deliveries,
    vehicles: [...vehicles.values()],
    kinematics: [...kinematics.values()],
  }
}
