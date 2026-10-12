import type { Location, RegionId, Waypoint } from "./geo"

/** A leg joins two consecutive waypoints of a route. */
export interface RouteLeg {
  readonly from: Waypoint
  readonly to: Waypoint
  /** Great-circle distance in kilometres. */
  readonly distanceKm: number
  /** Cumulative distance from the route origin to `from`, in kilometres. */
  readonly offsetKm: number
  /** Initial bearing from `from` to `to`, in degrees clockwise from north. */
  readonly bearing: number
}

export interface Route {
  readonly id: string
  readonly corridorId: string
  readonly name: string
  readonly originRegion: RegionId
  readonly destinationRegion: RegionId
  readonly origin: Waypoint
  readonly destination: Waypoint
  readonly legs: readonly RouteLeg[]
  readonly totalDistanceKm: number
  readonly freeFlowSpeed: number
}

/** Where a vehicle is along its route, expressed as distance travelled. */
export interface RouteProgress {
  readonly routeId: string
  readonly travelledKm: number
  readonly remainingKm: number
  readonly fraction: number
  readonly position: Location
  readonly bearing: number
  readonly legIndex: number
  readonly nextWaypoint: Waypoint | null
}

export type TrafficLevel = "normal" | "slow" | "congested"

/** Live traffic condition applied to one route. */
export interface TrafficCondition {
  readonly routeId: string
  readonly level: TrafficLevel
  /** Multiplier applied to free-flow speed (1 = free flow). */
  readonly speedFactor: number
  readonly since: number
  readonly description: string
}
