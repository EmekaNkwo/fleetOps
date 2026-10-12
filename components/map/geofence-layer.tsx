"use client"

import { useEffect, useMemo } from "react"
import type { FeatureCollection, Polygon } from "geojson"
import type { MapMouseEvent } from "mapbox-gl"
import { circleRing } from "@/lib/map/geo-circle"
import type { Geofence, Location } from "@/types"
import { useMapbox } from "./map-context"

interface GeofenceLayerProps {
  readonly zones: readonly Geofence[]
  readonly placing: boolean
  onPlace(centre: Location): void
}

/** Active zones read as a boundary; disabled ones as a faint outline. */
const ACTIVE_COLOUR = "#8b5cf6"
const INACTIVE_COLOUR = "#94a3b8"

const SOURCE_ID = "fleet-geofences"
const FILL_LAYER_ID = "fleet-geofences-fill"
const OUTLINE_LAYER_ID = "fleet-geofences-outline"
const DISABLED_OUTLINE_LAYER_ID = "fleet-geofences-outline-disabled"

interface ZoneProperties {
  readonly enabled: boolean
  readonly colour: string
  readonly fillOpacity: number
  readonly lineOpacity: number
  readonly lineWidth: number
}

function toFeatures(
  zones: readonly Geofence[]
): FeatureCollection<Polygon, ZoneProperties> {
  return {
    type: "FeatureCollection",
    features: zones.map((zone) => ({
      type: "Feature",
      id: zone.id,
      geometry: {
        type: "Polygon",
        coordinates: [circleRing(zone.centre, zone.radiusKm)],
      },
      properties: {
        enabled: zone.enabled,
        colour: zone.enabled ? ACTIVE_COLOUR : INACTIVE_COLOUR,
        fillOpacity: zone.enabled ? 0.08 : 0.03,
        lineOpacity: zone.enabled ? 0.9 : 0.5,
        lineWidth: zone.enabled ? 2 : 1,
      },
    })),
  }
}

/**
 * Operator-defined zones drawn on the basemap.
 *
 * Polygons in the basemap's own renderer rather than on the vehicle canvas:
 * there are at most twelve of them, they change only when the operator edits
 * one, and the GPU keeps them correctly projected through zooming for free. The
 * canvas layer exists because five hundred vehicles move every frame — that
 * argument does not apply to a dozen static boundaries.
 *
 * The rings are generated geographically because Mapbox's `circle-radius` is
 * measured in screen pixels, which would make a zone cover different ground at
 * every zoom level.
 */
export function GeofenceLayer({ zones, placing, onPlace }: GeofenceLayerProps) {
  const map = useMapbox()
  const features = useMemo(() => toFeatures(zones), [zones])

  useEffect(() => {
    // The style can be swapped between this layer being mounted for one and the
    // effect running, and a style that is not loaded rejects new sources. The
    // next style load remounts this component, so skipping is enough.
    if (!map.isStyleLoaded()) {
      return
    }

    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })

    map.addLayer({
      id: FILL_LAYER_ID,
      type: "fill",
      source: SOURCE_ID,
      paint: {
        "fill-color": ["get", "colour"],
        "fill-opacity": ["get", "fillOpacity"],
      },
    })

    map.addLayer({
      id: OUTLINE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      filter: ["==", ["get", "enabled"], true],
      paint: {
        "line-color": ["get", "colour"],
        "line-width": ["get", "lineWidth"],
        "line-opacity": ["get", "lineOpacity"],
      },
    })

    // Disabled zones are dashed as well as grey, and `line-dasharray` cannot be
    // driven from feature data — hence the second outline layer.
    map.addLayer({
      id: DISABLED_OUTLINE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      filter: ["==", ["get", "enabled"], false],
      paint: {
        "line-color": ["get", "colour"],
        "line-width": ["get", "lineWidth"],
        "line-opacity": ["get", "lineOpacity"],
        "line-dasharray": [4, 4],
      },
    })

    return () => {
      for (const id of [
        FILL_LAYER_ID,
        OUTLINE_LAYER_ID,
        DISABLED_OUTLINE_LAYER_ID,
      ]) {
        if (map.getLayer(id)) {
          map.removeLayer(id)
        }
      }
      if (map.getSource(SOURCE_ID)) {
        map.removeSource(SOURCE_ID)
      }
    }
  }, [map])

  useEffect(() => {
    const source = map.getSource(SOURCE_ID)
    if (source?.type === "geojson") {
      source.setData(features)
    }
  }, [map, features])

  useEffect(() => {
    if (!placing) {
      return
    }

    const canvas = map.getCanvas()
    const previousCursor = canvas.style.cursor
    canvas.style.cursor = "crosshair"

    const onClick = (event: MapMouseEvent): void => {
      onPlace({ lat: event.lngLat.lat, lng: event.lngLat.lng })
    }

    // Mapbox's own click event is used rather than a DOM listener so the
    // coordinate is already projected, and so a drag never registers as a
    // placement — Mapbox suppresses click after a pan.
    map.on("click", onClick)

    return () => {
      map.off("click", onClick)
      canvas.style.cursor = previousCursor
    }
  }, [map, placing, onPlace])

  return null
}
