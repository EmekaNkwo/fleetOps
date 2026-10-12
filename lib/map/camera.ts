import type { Map as MapboxMap } from "mapbox-gl"
import { worldScale, worldX, worldY } from "./projection"
import type { RenderViewport } from "./vehicle-renderer"

/**
 * Reads the Mapbox camera into the flat viewport the canvas renderers expect.
 *
 * Mapbox GL exposes no public "pixel origin" the way Leaflet did, so the origin
 * is derived from the centre instead: the world pixel coordinate of the centre,
 * minus half the viewport. Using the same Mercator maths as the renderers
 * guarantees the overlay lands exactly on the basemap underneath it.
 *
 * This holds only while bearing and pitch are zero, which is why the map
 * disables rotation and tilt outright — see `components/map/mapbox-map.tsx`.
 * Returns null when the container has no size, which happens while the map tab
 * is hidden behind another tab.
 */
export function readCameraViewport(map: MapboxMap): RenderViewport | null {
  const container = map.getContainer()
  const width = container.clientWidth
  const height = container.clientHeight

  if (width === 0 || height === 0) {
    return null
  }

  const zoom = map.getZoom()
  const centre = map.getCenter()
  const scale = worldScale(zoom)

  return {
    width,
    height,
    zoom,
    originX: worldX(centre.lng, scale) - width / 2,
    originY: worldY(centre.lat, scale) - height / 2,
    dpr: Math.min(2, window.devicePixelRatio || 1),
  }
}
