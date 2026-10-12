import { alertThresholds } from "@/services/simulation/thresholds"
import { HOUR_MS, minutesBetween } from "@/lib/clock"
import { clamp } from "@/lib/geo"
import type {
  Delivery,
  DeliveryCounts,
  DeliveryStatus,
  FleetCounts,
  TrafficLevel,
  Vehicle,
  VehicleStatus,
} from "@/types"

/** Speed multiplier applied to a route's free-flow speed per traffic level. */
const TRAFFIC_FACTORS: Readonly<Record<TrafficLevel, number>> = {
  normal: 1,
  slow: 0.62,
  congested: 0.34,
}

export function trafficFactor(level: TrafficLevel): number {
  return TRAFFIC_FACTORS[level]
}

/**
 * Ground speed for a vehicle on a route. Jitter keeps the fleet from moving in
 * lockstep; the floor stops congested vehicles from reading as stationary.
 */
export function effectiveSpeed(
  freeFlowSpeed: number,
  level: TrafficLevel,
  jitter: number
): number {
  const base = freeFlowSpeed * trafficFactor(level)
  return Math.max(6, base * (1 + jitter))
}

/** Hours of driving left, floored so a stalled vehicle still produces an ETA. */
export function hoursRemaining(remainingKm: number, speedKmh: number): number {
  return remainingKm / Math.max(5, speedKmh)
}

export function etaFromRemaining(
  now: number,
  remainingKm: number,
  speedKmh: number
): number {
  return now + hoursRemaining(remainingKm, speedKmh) * HOUR_MS
}

/** Positive when the delivery is forecast to miss its promised time. */
export function slippageMinutes(etaAt: number, promisedAt: number): number {
  return Math.max(0, minutesBetween(promisedAt, etaAt))
}

/** Minutes of headroom before the promise is breached. */
export function headroomMinutes(etaAt: number, promisedAt: number): number {
  return minutesBetween(etaAt, promisedAt)
}

/**
 * The delivery state machine. Terminal states are never recomputed; in-flight
 * deliveries are classified purely from ETA versus promise, which is what makes
 * a traffic spike propagate into an AT_RISK badge without any extra plumbing.
 */
export function deriveDeliveryStatus(input: {
  readonly current: DeliveryStatus
  readonly etaAt: number
  readonly promisedAt: number
}): DeliveryStatus {
  const { current, etaAt, promisedAt } = input

  if (
    current === "COMPLETED" ||
    current === "CANCELLED" ||
    current === "PENDING" ||
    current === "ASSIGNED"
  ) {
    return current
  }

  const slippage = slippageMinutes(etaAt, promisedAt)
  if (slippage > alertThresholds().delayedMinutes) {
    return "DELAYED"
  }
  if (headroomMinutes(etaAt, promisedAt) < alertThresholds().atRiskMinutes) {
    return "AT_RISK"
  }
  return "IN_TRANSIT"
}

/**
 * A vehicle's status is mostly a projection of the delivery it is carrying.
 * Connectivity always wins: an offline truck is offline regardless of its load.
 */
export function deriveVehicleStatus(input: {
  readonly current: VehicleStatus
  readonly deliveryStatus: DeliveryStatus | null
}): VehicleStatus {
  const { current, deliveryStatus } = input

  if (current === "OFFLINE") {
    return "OFFLINE"
  }
  if (!deliveryStatus) {
    return "IDLE"
  }

  switch (deliveryStatus) {
    case "DELAYED":
      return "DELAYED"
    case "AT_RISK":
      return "AT_RISK"
    case "COMPLETED":
      return "DELIVERED"
    case "CANCELLED":
    case "PENDING":
    case "ASSIGNED":
      // Loaded but not yet departed — the truck is still standing at the depot.
      return "IDLE"
    default:
      return "ON_ROUTE"
  }
}

export function isActiveDeliveryStatus(status: DeliveryStatus): boolean {
  return (
    status === "ASSIGNED" ||
    status === "IN_TRANSIT" ||
    status === "DELAYED" ||
    status === "AT_RISK"
  )
}

export function isInFlightDeliveryStatus(status: DeliveryStatus): boolean {
  return status === "IN_TRANSIT" || status === "DELAYED" || status === "AT_RISK"
}

/** An ETA is "accurate" when it still sits close to the dispatch estimate. */
export function isEtaAccurate(delivery: Delivery): boolean {
  const drift = Math.abs(minutesBetween(delivery.originalEtaAt, delivery.etaAt))
  return drift <= alertThresholds().etaAccuracyToleranceMinutes
}

export function countFleet(vehicles: readonly Vehicle[]): FleetCounts {
  let online = 0
  let offline = 0
  let onRoute = 0
  let idle = 0
  let delayed = 0
  let atRisk = 0

  for (const vehicle of vehicles) {
    if (vehicle.status === "OFFLINE") {
      offline += 1
      continue
    }
    online += 1
    switch (vehicle.status) {
      case "ON_ROUTE":
        onRoute += 1
        break
      case "DELAYED":
        delayed += 1
        break
      case "AT_RISK":
        atRisk += 1
        break
      case "IDLE":
      case "DELIVERED":
        idle += 1
        break
    }
  }

  return {
    total: vehicles.length,
    online,
    offline,
    onRoute,
    idle,
    delayed,
    atRisk,
  }
}

export function countDeliveries(
  deliveries: readonly Delivery[],
  dayStart: number
): DeliveryCounts {
  let pending = 0
  let assigned = 0
  let inTransit = 0
  let delayed = 0
  let atRisk = 0
  let completedToday = 0
  let cancelled = 0

  for (const delivery of deliveries) {
    switch (delivery.status) {
      case "PENDING":
        pending += 1
        break
      case "ASSIGNED":
        assigned += 1
        break
      case "IN_TRANSIT":
        inTransit += 1
        break
      case "DELAYED":
        delayed += 1
        break
      case "AT_RISK":
        atRisk += 1
        break
      case "CANCELLED":
        cancelled += 1
        break
      case "COMPLETED":
        if ((delivery.completedAt ?? 0) >= dayStart) {
          completedToday += 1
        }
        break
    }
  }

  return {
    total: deliveries.length,
    pending,
    assigned,
    inTransit,
    delayed,
    atRisk,
    completedToday,
    cancelled,
  }
}

export interface DeliveryPerformance {
  readonly onTimeRate: number
  readonly averageDelayMinutes: number
  readonly averageDeliveryMinutes: number
  readonly etaAccuracy: number
  readonly deliveriesPerHour: number
}

/**
 * Aggregate delivery performance. On-time rate and average duration look at
 * closed deliveries; ETA accuracy looks at live ones, because that is the
 * number a dispatcher can still act on.
 */
export function computePerformance(
  deliveries: readonly Delivery[],
  now: number
): DeliveryPerformance {
  let completed = 0
  let onTime = 0
  let durationTotal = 0
  let delayTotal = 0
  let delayCount = 0
  let liveCount = 0
  let accurate = 0
  let completedLastHour = 0

  for (const delivery of deliveries) {
    if (delivery.status === "COMPLETED" && delivery.completedAt !== null) {
      completed += 1
      if (delivery.completedAt <= delivery.promisedAt) {
        onTime += 1
      }
      if (delivery.startedAt !== null) {
        durationTotal += minutesBetween(delivery.startedAt, delivery.completedAt)
      }
      if (now - delivery.completedAt <= HOUR_MS) {
        completedLastHour += 1
      }
    }

    if (isInFlightDeliveryStatus(delivery.status)) {
      liveCount += 1
      if (isEtaAccurate(delivery)) {
        accurate += 1
      }
      if (delivery.delayMinutes > 0) {
        delayTotal += delivery.delayMinutes
        delayCount += 1
      }
    }
  }

  return {
    onTimeRate: completed === 0 ? 1 : onTime / completed,
    averageDelayMinutes: delayCount === 0 ? 0 : delayTotal / delayCount,
    averageDeliveryMinutes: completed === 0 ? 0 : durationTotal / completed,
    etaAccuracy: liveCount === 0 ? 1 : accurate / liveCount,
    deliveriesPerHour: completedLastHour,
  }
}

/** Share of the fleet actively carrying a delivery. */
export function fleetUtilisation(counts: FleetCounts): number {
  if (counts.total === 0) {
    return 0
  }
  return (counts.onRoute + counts.delayed + counts.atRisk) / counts.total
}

export function fleetAvailability(counts: FleetCounts): number {
  if (counts.total === 0) {
    return 0
  }
  return counts.online / counts.total
}

/** Fuel burn for a leg, as a percentage of tank capacity. */
export function fuelBurnPercent(distanceKm: number, capacityKg: number): number {
  const heavy = capacityKg > 10_000
  return distanceKm * (heavy ? 0.055 : 0.03)
}

export function minutesToBreach(delivery: Delivery, now: number): number {
  return clamp(minutesBetween(now, delivery.promisedAt), -600, 600)
}

export function delayFromEta(etaAt: number, promisedAt: number): number {
  return Math.round(slippageMinutes(etaAt, promisedAt))
}

export function startOfDay(at: number): number {
  const date = new Date(at)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

