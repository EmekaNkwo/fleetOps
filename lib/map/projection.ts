/**
 * Spherical Mercator projection, allocation free.
 *
 * Mapbox GL's own `map.project()` allocates a `Point` per call. At 500 vehicles
 * × 60fps that is 30,000 short-lived objects a second, which turns into visible
 * GC sawtooth. The maths is public and stable, so the hot path computes it
 * directly into primitives instead.
 *
 * Zoom follows Mapbox GL's convention — 512px world tiles, so the whole world
 * is 512px wide at zoom 0. That is one level coarser than the 256px convention
 * Leaflet and raster XYZ tiles use: Mapbox zoom `z` covers the same ground as
 * Leaflet zoom `z + 1`.
 */
const DEG_TO_RAD = Math.PI / 180
/** Mapbox GL's tile size. See the note above before changing this. */
const TILE_SIZE = 512
/** Clamp to Mercator's usable latitude range before the log blows up. */
const MAX_LATITUDE = 85.0511287798

export interface ProjectionFrame {
  /** World pixel size at the current zoom. */
  readonly scale: number
  readonly originX: number
  readonly originY: number
}

/** World pixel width at `zoom`. */
export function worldScale(zoom: number): number {
  return TILE_SIZE * 2 ** zoom
}

/** Absolute world pixel X, before the viewport origin is subtracted. */
export function worldX(lng: number, scale: number): number {
  return ((lng + 180) / 360) * scale
}

/** Absolute world pixel Y, before the viewport origin is subtracted. */
export function worldY(lat: number, scale: number): number {
  const clamped =
    lat > MAX_LATITUDE ? MAX_LATITUDE : lat < -MAX_LATITUDE ? -MAX_LATITUDE : lat
  const sin = Math.sin(clamped * DEG_TO_RAD)
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
}

export function createProjectionFrame(
  zoom: number,
  originX: number,
  originY: number
): ProjectionFrame {
  return { scale: worldScale(zoom), originX, originY }
}

export function projectX(lng: number, frame: ProjectionFrame): number {
  return worldX(lng, frame.scale) - frame.originX
}

export function projectY(lat: number, frame: ProjectionFrame): number {
  return worldY(lat, frame.scale) - frame.originY
}
