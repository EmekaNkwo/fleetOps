import type { Location } from "@/types"

const DEG_TO_RAD = Math.PI / 180
/** Length of one degree of latitude, in kilometres. */
const KM_PER_DEGREE = 111.32
/** Points per ring. 64 is smooth at every zoom the map allows. */
const SEGMENTS = 64

/**
 * A circle of `radiusKm` around `centre`, as a closed GeoJSON ring.
 *
 * Mapbox GL has no metric-radius circle: `circle-radius` is in screen pixels,
 * so a zone drawn that way would cover a different area at every zoom. A
 * polygon in geographic space is the standard answer and projects correctly for
 * free.
 *
 * The maths is the equirectangular approximation rather than a true geodesic —
 * within a fraction of a percent at the radii a depot boundary uses, and the
 * zone is an operator-drawn boundary, not a survey.
 */
export function circleRing(centre: Location, radiusKm: number): number[][] {
  const latDelta = radiusKm / KM_PER_DEGREE
  // Degrees of longitude shrink towards the poles.
  const lngDelta = radiusKm / (KM_PER_DEGREE * Math.cos(centre.lat * DEG_TO_RAD))

  const ring: number[][] = []
  for (let i = 0; i < SEGMENTS; i += 1) {
    const theta = (i / SEGMENTS) * Math.PI * 2
    ring.push([
      centre.lng + lngDelta * Math.cos(theta),
      centre.lat + latDelta * Math.sin(theta),
    ])
  }
  // GeoJSON polygons must close.
  ring.push(ring[0] ?? [centre.lng, centre.lat])

  return ring
}
