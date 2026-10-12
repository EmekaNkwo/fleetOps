import { REGION_BY_ID } from "@/data/geography"
import type {
  Customer,
  Delivery,
  Driver,
  Route,
  SearchResult,
  SearchResultGroup,
  SearchResultKind,
  Vehicle,
} from "@/types"

export interface SearchIndexInput {
  readonly vehicles: readonly Vehicle[]
  readonly drivers: readonly Driver[]
  readonly deliveries: readonly Delivery[]
  readonly customers: readonly Customer[]
  readonly routes: readonly Route[]
  readonly driverNameById: Readonly<Record<string, string>>
  readonly customerNameById: Readonly<Record<string, string>>
}

/** Per-group cap. Operators scan, they do not page through search results. */
const GROUP_LIMIT = 5

const GROUP_LABELS: Readonly<Record<SearchResultKind, string>> = {
  vehicle: "Vehicles",
  driver: "Drivers",
  delivery: "Deliveries",
  customer: "Customers",
  route: "Routes",
}

const GROUP_ORDER: readonly SearchResultKind[] = [
  "vehicle",
  "delivery",
  "driver",
  "customer",
  "route",
]

/**
 * Scores a candidate against the query. Exact matches beat prefixes, prefixes
 * beat substrings, and a miss scores zero — enough ranking that typing "192"
 * puts vehicle 192 above delivery #DEL-28192 without pulling in a fuzzy-search
 * dependency.
 */
export function scoreMatch(haystack: string, needle: string): number {
  const value = haystack.toLowerCase()
  if (value === needle) {
    return 100
  }
  if (value.startsWith(needle)) {
    return 70
  }
  const index = value.indexOf(needle)
  if (index === -1) {
    return 0
  }
  // Later matches are weaker, but never worthless.
  return Math.max(20, 50 - index)
}

function best(
  needle: string,
  candidates: readonly (string | undefined)[]
): number {
  let score = 0
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }
    score = Math.max(score, scoreMatch(candidate, needle))
  }
  return score
}

/**
 * Global search across the operation. Pure and synchronous: debouncing and
 * memoisation belong to the hook that calls it, not here.
 */
export function searchOperations(
  rawQuery: string,
  input: SearchIndexInput
): readonly SearchResultGroup[] {
  const needle = rawQuery.trim().toLowerCase()
  if (needle.length < 1) {
    return []
  }

  const buckets = new Map<SearchResultKind, SearchResult[]>()
  const add = (kind: SearchResultKind, result: SearchResult): void => {
    const bucket = buckets.get(kind) ?? []
    bucket.push(result)
    buckets.set(kind, bucket)
  }

  for (const vehicle of input.vehicles) {
    const score = best(needle, [
      vehicle.callSign,
      vehicle.plateNumber,
      vehicle.type,
    ])
    if (score > 0) {
      add("vehicle", {
        kind: "vehicle",
        id: vehicle.id,
        title: `Vehicle ${vehicle.callSign}`,
        subtitle: `${vehicle.type} · ${vehicle.plateNumber}`,
        score,
      })
    }
  }

  for (const driver of input.drivers) {
    const score = best(needle, [driver.name, driver.shortName, driver.phone])
    if (score > 0) {
      add("driver", {
        kind: "driver",
        id: driver.id,
        title: driver.name,
        subtitle: `${driver.status.toLowerCase().replace("_", " ")} · ${driver.phone}`,
        score,
      })
    }
  }

  for (const delivery of input.deliveries) {
    const customer = input.customerNameById[delivery.customerId]
    const score = best(needle, [delivery.reference, customer])
    if (score > 0) {
      add("delivery", {
        kind: "delivery",
        id: delivery.id,
        title: `#${delivery.reference}`,
        subtitle: `${customer ?? "Unknown customer"} · ${delivery.status.toLowerCase().replace("_", " ")}`,
        score,
      })
    }
  }

  for (const customer of input.customers) {
    const score = best(needle, [customer.name, customer.contact])
    if (score > 0) {
      add("customer", {
        kind: "customer",
        id: customer.id,
        title: customer.name,
        subtitle: `${customer.contact} · ${REGION_BY_ID[customer.region]?.name ?? customer.region}`,
        score,
      })
    }
  }

  for (const route of input.routes) {
    const score = best(needle, [
      route.name,
      route.origin.name,
      route.destination.name,
    ])
    if (score > 0) {
      add("route", {
        kind: "route",
        id: route.id,
        title: route.name,
        subtitle: `${Math.round(route.totalDistanceKm)} km · free flow ${route.freeFlowSpeed} km/h`,
        score,
      })
    }
  }

  const groups: SearchResultGroup[] = []
  for (const kind of GROUP_ORDER) {
    const bucket = buckets.get(kind)
    if (!bucket || bucket.length === 0) {
      continue
    }
    bucket.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    groups.push({
      kind,
      label: GROUP_LABELS[kind],
      results: bucket.slice(0, GROUP_LIMIT),
    })
  }

  return groups
}

export function totalResults(groups: readonly SearchResultGroup[]): number {
  return groups.reduce((sum, group) => sum + group.results.length, 0)
}

export function flattenResults(
  groups: readonly SearchResultGroup[]
): readonly SearchResult[] {
  return groups.flatMap((group) => group.results)
}
