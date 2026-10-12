import { CORRIDORS, WAYPOINT_BY_ID } from "@/data/geography"
import { bearingDegrees, haversineKm, interpolate } from "@/lib/geo"
import type {
  Corridor,
  Location,
  Route,
  RouteLeg,
  RouteProgress,
  Waypoint,
} from "@/types"

function resolveWaypoints(ids: readonly string[]): Waypoint[] {
  return ids.map((id) => {
    const point = WAYPOINT_BY_ID[id]
    if (!point) {
      throw new Error(`Unknown waypoint "${id}" referenced by a corridor`)
    }
    return point
  })
}

function buildLegs(points: readonly Waypoint[]): RouteLeg[] {
  const legs: RouteLeg[] = []
  let offsetKm = 0

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index] as Waypoint
    const to = points[index + 1] as Waypoint
    const distanceKm = haversineKm(from, to)
    legs.push({
      from,
      to,
      distanceKm,
      offsetKm,
      bearing: bearingDegrees(from, to),
    })
    offsetKm += distanceKm
  }

  return legs
}

function buildRoute(corridor: Corridor, reversed: boolean): Route {
  const ids = reversed
    ? [...corridor.waypointIds].reverse()
    : corridor.waypointIds
  const points = resolveWaypoints(ids)
  const legs = buildLegs(points)
  const origin = points[0]
  const destination = points[points.length - 1]

  if (!origin || !destination) {
    throw new Error(`Corridor "${corridor.id}" has too few waypoints`)
  }

  const originRegion = reversed ? corridor.to : corridor.from
  const destinationRegion = reversed ? corridor.from : corridor.to

  return {
    id: reversed ? `${corridor.id}-rev` : corridor.id,
    corridorId: corridor.id,
    name: `${origin.name} → ${destination.name}`,
    originRegion,
    destinationRegion,
    origin,
    destination,
    legs,
    totalDistanceKm: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
    freeFlowSpeed: corridor.freeFlowSpeed,
  }
}

/**
 * Expands every corridor into a forward and a reverse route. Metro corridors
 * start and end in the same region, so the reverse variant models the return
 * leg of a city round trip.
 */
export function buildRoutes(): Route[] {
  return CORRIDORS.flatMap((corridor) => [
    buildRoute(corridor, false),
    buildRoute(corridor, true),
  ])
}

/**
 * Resolves a distance-along-route into a coordinate, bearing and leg index.
 * This is the single source of geometric truth for vehicle position: the
 * simulation advances `travelledKm` and everything else is derived.
 */
export function resolveProgress(
  route: Route,
  travelledKm: number
): RouteProgress {
  const total = route.totalDistanceKm
  const travelled = travelledKm <= 0 ? 0 : travelledKm >= total ? total : travelledKm

  let legIndex = 0
  for (let index = 0; index < route.legs.length; index += 1) {
    const leg = route.legs[index] as RouteLeg
    if (travelled <= leg.offsetKm + leg.distanceKm || index === route.legs.length - 1) {
      legIndex = index
      break
    }
  }

  const leg = route.legs[legIndex] as RouteLeg
  const withinLeg = leg.distanceKm === 0 ? 0 : (travelled - leg.offsetKm) / leg.distanceKm
  const position = interpolate(leg.from, leg.to, withinLeg)

  return {
    routeId: route.id,
    travelledKm: travelled,
    remainingKm: Math.max(0, total - travelled),
    fraction: total === 0 ? 1 : travelled / total,
    position,
    bearing: leg.bearing,
    legIndex,
    nextWaypoint: withinLeg >= 1 ? null : leg.to,
  }
}

/** Flat coordinate list for drawing the route as a polyline. */
export function routePolyline(route: Route): Location[] {
  const first = route.legs[0]
  if (!first) {
    return [route.origin]
  }
  return [first.from, ...route.legs.map((leg) => leg.to)]
}
