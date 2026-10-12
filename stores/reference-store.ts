import { create } from "zustand"
import type { Customer, Driver, Route, TrafficCondition } from "@/types"

/**
 * Static reference data: the road network, the driver roster and the customer
 * book. It changes only on bootstrap or reset, so it is deliberately kept apart
 * from the high-churn operational stores — components that read a driver name
 * must not re-render because a truck moved.
 */
interface ReferenceState {
  readonly routesById: Readonly<Record<string, Route>>
  readonly routes: readonly Route[]
  readonly driversById: Readonly<Record<string, Driver>>
  readonly drivers: readonly Driver[]
  readonly customersById: Readonly<Record<string, Customer>>
  readonly customers: readonly Customer[]
  readonly trafficByRoute: Readonly<Record<string, TrafficCondition>>
  readonly ready: boolean
  replaceAll(input: {
    readonly routes: readonly Route[]
    readonly drivers: readonly Driver[]
    readonly customers: readonly Customer[]
    readonly traffic: readonly TrafficCondition[]
  }): void
  applyTraffic(conditions: readonly TrafficCondition[]): void
}

function index<T extends { id: string }>(items: readonly T[]): Record<string, T> {
  const result: Record<string, T> = {}
  for (const item of items) {
    result[item.id] = item
  }
  return result
}

export const useReferenceStore = create<ReferenceState>()((set) => ({
  routesById: {},
  routes: [],
  driversById: {},
  drivers: [],
  customersById: {},
  customers: [],
  trafficByRoute: {},
  ready: false,

  replaceAll: ({ routes, drivers, customers, traffic }) => {
    const trafficByRoute: Record<string, TrafficCondition> = {}
    for (const condition of traffic) {
      trafficByRoute[condition.routeId] = condition
    }

    set({
      routes,
      routesById: index(routes),
      drivers,
      driversById: index(drivers),
      customers,
      customersById: index(customers),
      trafficByRoute,
      ready: true,
    })
  },

  applyTraffic: (conditions) => {
    if (conditions.length === 0) {
      return
    }
    set((state) => {
      const trafficByRoute = { ...state.trafficByRoute }
      for (const condition of conditions) {
        trafficByRoute[condition.routeId] = condition
      }
      return { trafficByRoute }
    })
  },
}))
