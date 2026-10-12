import { MINUTE_MS } from "@/lib/clock"
import { delayFromEta, etaFromRemaining } from "@/lib/calculations"
import { resolveProgress } from "@/lib/routing"
import { timelineEntry } from "@/lib/timeline"
import type { Delivery, DeliveryPriority, Route } from "@/types"
import { deliveryId, nextDeliveryReference } from "@/services/mock/ids"
import type { Emit } from "../emit"
import { requireRoute, type World } from "../world"
import { speedForRoute } from "./deliveries"

const PRIORITIES: readonly DeliveryPriority[] = [
  "STANDARD",
  "STANDARD",
  "STANDARD",
  "EXPRESS",
  "EXPRESS",
  "CRITICAL",
]

/**
 * Picks the idle vehicle that is already closest to a route's origin. Real
 * dispatch optimises for deadhead distance, and doing the same here means new
 * orders appear on believable parts of the map instead of teleporting a truck
 * across the country.
 */
function chooseVehicleFor(world: World, route: Route): string | null {
  let bestId: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const vehicleId of world.idleVehicleIds) {
    const vehicle = world.vehicles.get(vehicleId)
    if (!vehicle || vehicle.status === "OFFLINE") {
      continue
    }

    const latDelta = vehicle.location.lat - route.origin.lat
    const lngDelta = vehicle.location.lng - route.origin.lng
    const distance = latDelta * latDelta + lngDelta * lngDelta

    if (distance < bestDistance) {
      bestDistance = distance
      bestId = vehicleId
    }
  }

  return bestId
}

export interface DispatchResult {
  readonly delivery: Delivery
  readonly vehicleId: string
}

/**
 * Creates an order, assigns a vehicle and puts it on the road, publishing the
 * full created → assigned → started sequence so the activity feed reads like a
 * real dispatch log rather than a single synthetic event.
 */
export function dispatchNewDelivery(
  world: World,
  emit: Emit,
  options: { readonly routeId?: string } = {}
): DispatchResult | null {
  const { rng, clock } = world
  const now = clock.now()

  const routeId =
    options.routeId ??
    world.routeIds[rng.int(0, world.routeIds.length - 1)] ??
    world.routeIds[0]

  if (!routeId) {
    return null
  }

  const route = requireRoute(world, routeId)
  const vehicleId = chooseVehicleFor(world, route)
  if (!vehicleId) {
    return null
  }

  const vehicle = world.vehicles.get(vehicleId)
  const kin = world.kinematics.get(vehicleId)
  if (!vehicle || !kin) {
    return null
  }

  const customers = [...world.customers.values()]
  const customer = customers[rng.int(0, customers.length - 1)]
  if (!customer) {
    return null
  }

  const reference = nextDeliveryReference(world.counters)
  const id = deliveryId(reference)
  const speed = speedForRoute(world, route, kin.jitter)
  const etaAt = etaFromRemaining(now, route.totalDistanceKm, speed)
  const promisedAt = etaAt + rng.int(30, 150) * MINUTE_MS
  const progress = resolveProgress(route, 0)

  const delivery: Delivery = {
    id,
    reference,
    status: "IN_TRANSIT",
    priority: PRIORITIES[rng.int(0, PRIORITIES.length - 1)] ?? "STANDARD",
    customerId: customer.id,
    vehicleId,
    driverId: vehicle.driverId,
    routeId: route.id,
    originRegion: route.originRegion,
    destinationRegion: route.destinationRegion,
    weightKg: rng.int(150, 24_000),
    createdAt: now,
    startedAt: now,
    completedAt: null,
    promisedAt,
    etaAt,
    originalEtaAt: etaAt,
    delayMinutes: delayFromEta(etaAt, promisedAt),
    progressFraction: 0,
    remainingKm: route.totalDistanceKm,
    timeline: [
      timelineEntry({ kind: "created", label: "Order received", at: now }),
      timelineEntry({
        kind: "assigned",
        label: "Vehicle assigned",
        at: now,
        detail: `Vehicle ${vehicle.callSign} — ${vehicle.plateNumber}`,
      }),
      timelineEntry({
        kind: "departed",
        label: "Vehicle departed",
        at: now,
        detail: route.origin.name,
        state: "active",
      }),
      timelineEntry({
        kind: "arrival",
        label: "Arrival at destination",
        at: etaAt,
        detail: route.destination.name,
        state: "upcoming",
      }),
    ],
  }

  world.deliveries.set(id, delivery)
  world.etaWatermarks.set(id, etaAt)
  world.idleVehicleIds.delete(vehicleId)

  world.vehicles.set(vehicleId, {
    ...vehicle,
    status: "ON_ROUTE",
    routeId: route.id,
    deliveryId: id,
    location: progress.position,
    heading: progress.bearing,
    speed,
    lastSeen: now,
  })

  kin.routeId = route.id
  kin.travelledKm = 0
  kin.speed = speed
  kin.heading = progress.bearing
  kin.stoppedUntil = null

  emit("delivery.created", { delivery })
  emit("delivery.assigned", {
    deliveryId: id,
    vehicleId,
    driverId: vehicle.driverId,
  })
  emit("delivery.started", { deliveryId: id })
  emit("vehicle.status.changed", {
    vehicleId,
    from: vehicle.status,
    to: "ON_ROUTE",
    reason: `Assigned to delivery #${reference}`,
  })

  return { delivery, vehicleId }
}
