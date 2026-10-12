/**
 * Geographic primitives. Coordinates follow the `{ lat, lng }` convention used
 * throughout the app rather than GeoJSON's `[lng, lat]` tuples, which are
 * produced only at the boundary where a layer is handed to Mapbox.
 */

export interface Location {
  readonly lat: number
  readonly lng: number
}

/** A named point on the network: a city, depot, junction or interchange. */
export interface Waypoint extends Location {
  readonly id: string
  readonly name: string
  readonly kind: WaypointKind
}

export type WaypointKind = "city" | "junction" | "depot" | "hub"

export type RegionId =
  | "lagos"
  | "ibadan"
  | "abuja"
  | "port-harcourt"
  | "benin-city"
  | "abeokuta"
  | "ilorin"
  | "enugu"
  | "onitsha"
  | "kano"

export interface Region {
  readonly id: RegionId
  readonly name: string
  readonly state: string
  readonly center: Location
}

export interface BoundingBox {
  readonly south: number
  readonly west: number
  readonly north: number
  readonly east: number
}

/**
 * A corridor is the physical road network between two regions, described by an
 * ordered list of waypoints. Routes are cut from corridors.
 */
export interface Corridor {
  readonly id: string
  readonly name: string
  readonly from: RegionId
  readonly to: RegionId
  readonly waypointIds: readonly string[]
  /** Nominal free-flow speed in km/h, used as the kinematic baseline. */
  readonly freeFlowSpeed: number
}
