import type { Clock } from "@/lib/clock"
import type { Rng } from "@/lib/random"
import type {
  Alert,
  Customer,
  Delivery,
  Driver,
  Incident,
  OperationsSnapshot,
  Route,
  TrafficCondition,
  Vehicle,
} from "@/types"
import type { ReferenceCounters } from "@/services/mock/ids"

/**
 * Per-vehicle kinematic state. Distance along the route is the authoritative
 * quantity; latitude/longitude are always derived from it, which is why
 * vehicles track the road instead of drifting across the map.
 */
export interface VehicleKinematics {
  readonly vehicleId: string
  routeId: string | null
  travelledKm: number
  speed: number
  heading: number
  /** Persistent per-driver speed bias in [-0.12, 0.12]; keeps the fleet varied. */
  readonly jitter: number
  /** Simulated timestamp at which a disconnected vehicle comes back online. */
  offlineUntil: number | null
  /** Simulated timestamp at which a halted vehicle resumes. */
  stoppedUntil: number | null
}

/**
 * The simulation's authoritative state. Stores hold a *projection* of this,
 * rebuilt from events — the engine never writes to a store and the UI never
 * reads this object.
 */
export interface World {
  readonly clock: Clock
  readonly rng: Rng
  readonly routes: ReadonlyMap<string, Route>
  readonly routeIds: readonly string[]
  readonly drivers: ReadonlyMap<string, Driver>
  readonly customers: ReadonlyMap<string, Customer>
  readonly vehicles: Map<string, Vehicle>
  readonly deliveries: Map<string, Delivery>
  readonly incidents: Map<string, Incident>
  readonly alerts: Map<string, Alert>
  readonly traffic: Map<string, TrafficCondition>
  readonly kinematics: Map<string, VehicleKinematics>
  /** Vehicles with no delivery, available for new assignments. */
  readonly idleVehicleIds: Set<string>
  /**
   * Last ETA announced per delivery. Continuous integration nudges every ETA
   * by seconds each tick; only a material revision is worth an event, and this
   * is the watermark that decides what counts as material.
   */
  readonly etaWatermarks: Map<string, number>
  readonly counters: ReferenceCounters
  readonly startedAt: number
}

/**
 * Projects a bootstrap payload into the engine's working state. Collections are
 * copied into maps for O(1) lookup during the movement tick, which touches
 * every in-flight vehicle once per second.
 */
export function createWorld(input: {
  readonly clock: Clock
  readonly rng: Rng
  readonly snapshot: OperationsSnapshot
  readonly kinematics: readonly VehicleKinematics[]
  readonly counters: ReferenceCounters
}): World {
  const { clock, rng, snapshot, kinematics, counters } = input

  const vehicles = new Map(snapshot.vehicles.map((v) => [v.id, v]))
  const deliveries = new Map(snapshot.deliveries.map((d) => [d.id, d]))
  const idleVehicleIds = new Set(
    snapshot.vehicles
      .filter((vehicle) => vehicle.deliveryId === null)
      .map((vehicle) => vehicle.id)
  )

  return {
    clock,
    rng,
    routes: new Map(snapshot.routes.map((route) => [route.id, route])),
    routeIds: snapshot.routes.map((route) => route.id),
    drivers: new Map(snapshot.drivers.map((driver) => [driver.id, driver])),
    customers: new Map(
      snapshot.customers.map((customer) => [customer.id, customer])
    ),
    vehicles,
    deliveries,
    incidents: new Map(
      snapshot.incidents.map((incident) => [incident.id, incident])
    ),
    alerts: new Map(snapshot.alerts.map((alert) => [alert.id, alert])),
    traffic: new Map(
      snapshot.traffic.map((condition) => [condition.routeId, condition])
    ),
    kinematics: new Map(kinematics.map((kin) => [kin.vehicleId, { ...kin }])),
    idleVehicleIds,
    etaWatermarks: new Map(
      snapshot.deliveries.map((delivery) => [delivery.id, delivery.etaAt])
    ),
    counters,
    startedAt: clock.now(),
  }
}

/** Convenience accessor that throws loudly on a dangling reference. */
export function requireRoute(world: World, routeId: string): Route {
  const route = world.routes.get(routeId)
  if (!route) {
    throw new Error(`Simulation referenced unknown route "${routeId}"`)
  }
  return route
}
