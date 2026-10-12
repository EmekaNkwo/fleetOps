import { DATASET } from "@/data/config"
import { createRng } from "@/lib/random"
import { buildRoutes } from "@/lib/routing"
import type { Delivery, OperationsSnapshot, Route } from "@/types"
import type { VehicleKinematics } from "@/services/simulation/world"
import { generateDeliveries } from "./deliveries"
import { generateFleet } from "./fleet"
import { createCounters, type ReferenceCounters } from "./ids"
import {
  generateActivity,
  generateAlerts,
  generateIncidents,
  generateTraffic,
} from "./ops"
import { generateCustomers, generateDrivers } from "./roster"

/**
 * Everything a cold start needs: the snapshot the stores project, plus the
 * kinematic state the simulation engine integrates. Both come from one seeded
 * pass so the two views of the world can never start out disagreeing.
 */
export interface BootstrapData {
  readonly snapshot: OperationsSnapshot
  readonly kinematics: readonly VehicleKinematics[]
  readonly counters: ReferenceCounters
  /**
   * The options this world was generated from. The engine keeps them so a
   * reset regenerates an identical world rather than falling back to the
   * defaults and silently changing the fleet size.
   */
  readonly options: Required<GenerateOptions>
}

export interface GenerateOptions {
  readonly seed?: number
  readonly now?: number
  readonly vehicles?: number
  readonly deliveries?: number
  readonly completedBacklog?: number
}

/**
 * Deterministic world generation. The same seed always yields the same fleet,
 * board and incident list, which is what makes "Reset simulation" restore the
 * original dataset and what makes the business-layer tests stable.
 */
export function generateBootstrapData(
  options: GenerateOptions = {}
): BootstrapData {
  const seed = options.seed ?? DATASET.seed
  const now = options.now ?? Date.now()
  const rng = createRng(seed)
  const counters = createCounters()

  const routes: Route[] = buildRoutes()
  const routesById = new Map(routes.map((route) => [route.id, route]))

  const drivers = generateDrivers(rng, DATASET.drivers)
  const customers = generateCustomers(rng, DATASET.customers)
  const traffic = generateTraffic(rng, routes, now)

  const fleet = generateFleet(
    rng,
    options.vehicles ?? DATASET.vehicles,
    routes,
    drivers.map((driver) => driver.id),
    now
  )

  const { deliveries, vehicles, kinematics } = generateDeliveries({
    rng,
    routes,
    fleet,
    drivers,
    customers,
    traffic,
    counters,
    now,
    completedBacklog: options.completedBacklog ?? DATASET.completedBacklog,
  })

  const deliveriesById = new Map<string, Delivery>(
    deliveries.map((delivery) => [delivery.id, delivery])
  )

  const incidents = generateIncidents(
    rng,
    DATASET.incidents,
    vehicles,
    deliveriesById,
    routesById,
    counters,
    now
  )

  const alerts = generateAlerts(
    rng,
    vehicles,
    deliveries,
    traffic,
    routesById,
    incidents,
    counters,
    now
  )

  const activity = generateActivity(
    rng,
    DATASET.activityBacklog,
    vehicles,
    deliveries,
    drivers,
    routesById,
    counters,
    now
  )

  const resolvedOptions: Required<GenerateOptions> = {
    seed,
    now,
    vehicles: options.vehicles ?? DATASET.vehicles,
    deliveries: options.deliveries ?? DATASET.deliveries,
    completedBacklog: options.completedBacklog ?? DATASET.completedBacklog,
  }

  return {
    options: resolvedOptions,
    snapshot: {
      generatedAt: now,
      routes,
      drivers,
      customers,
      vehicles,
      deliveries,
      incidents,
      alerts,
      activity,
      traffic: [...traffic.values()],
    },
    kinematics,
    counters,
  }
}
