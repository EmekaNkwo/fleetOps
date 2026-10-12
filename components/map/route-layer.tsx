"use client"

import { useEffect, useMemo } from "react"
import type { FeatureCollection, LineString } from "geojson"
import type { RouteLine } from "@/hooks"
import { useMapbox } from "./map-context"

interface RouteLayerProps {
  readonly lines: readonly RouteLine[]
  /** Corridor of the current selection, drawn above the rest. */
  readonly highlighted: RouteLine | null
  readonly visible: boolean
}

const SOURCE_ID = "fleet-routes"
const HIGHLIGHT_SOURCE_ID = "fleet-route-highlight"
const SOLID_LAYER_ID = "fleet-routes-solid"
const DASHED_LAYER_ID = "fleet-routes-dashed"
const HIGHLIGHT_LAYER_ID = "fleet-route-highlight"

/**
 * Highlight colour for the selected corridor. Hard-coded rather than read from
 * a CSS variable: Mapbox needs a resolved colour, and this blue reads against
 * both the light and the dark basemap.
 */
const HIGHLIGHT_COLOUR = "#3b82f6"

function routeWeight(line: RouteLine): number {
  return line.level === "congested" ? 3 : line.level === "slow" ? 2.5 : 1.5
}

interface RouteProperties {
  readonly colour: string
  readonly width: number
  readonly opacity: number
}

function toFeatures(
  lines: readonly RouteLine[]
): FeatureCollection<LineString, RouteProperties> {
  return {
    type: "FeatureCollection",
    features: lines.map((line) => ({
      type: "Feature",
      id: line.routeId,
      geometry: {
        type: "LineString",
        coordinates: line.points.map((point) => [point.lng, point.lat]),
      },
      properties: {
        colour: line.colour,
        width: routeWeight(line),
        opacity: line.level === "normal" ? 0.35 : 0.75,
      },
    })),
  }
}

function toHighlight(
  line: RouteLine | null
): FeatureCollection<LineString, Record<string, never>> {
  return {
    type: "FeatureCollection",
    features: line
      ? [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: line.points.map((point) => [point.lng, point.lat]),
            },
            properties: {},
          },
        ]
      : [],
  }
}

/**
 * The corridor network, as two GeoJSON line layers plus the highlight.
 *
 * Twenty-six corridors drawn by the GPU cost nothing per frame, so unlike the
 * fleet they do not belong on the hand-rolled canvas. They are split across two
 * layers because `line-dasharray` is the one paint property Mapbox cannot drive
 * from feature data — congested corridors are dashed as well as red, so the
 * state stays legible without relying on colour.
 */
export function RouteLayer({ lines, highlighted, visible }: RouteLayerProps) {
  const map = useMapbox()

  const solid = useMemo(
    () => toFeatures(lines.filter((line) => !line.dashed)),
    [lines]
  )
  const dashed = useMemo(
    () => toFeatures(lines.filter((line) => line.dashed)),
    [lines]
  )
  const highlight = useMemo(() => toHighlight(highlighted), [highlighted])

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
    map.addSource(`${SOURCE_ID}-dashed`, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })
    map.addSource(HIGHLIGHT_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })

    map.addLayer({
      id: SOLID_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "colour"],
        "line-width": ["get", "width"],
        "line-opacity": ["get", "opacity"],
      },
    })
    map.addLayer({
      id: DASHED_LAYER_ID,
      type: "line",
      source: `${SOURCE_ID}-dashed`,
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: {
        "line-color": ["get", "colour"],
        "line-width": ["get", "width"],
        "line-opacity": ["get", "opacity"],
        "line-dasharray": [4, 3],
      },
    })

    // Above the overlay and above the fleet's own route lines, so a single
    // journey stays traceable in a network of twenty-six.
    map.addLayer({
      id: HIGHLIGHT_LAYER_ID,
      type: "line",
      source: HIGHLIGHT_SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": HIGHLIGHT_COLOUR,
        "line-width": 5,
        "line-opacity": 0.9,
      },
    })

    return () => {
      // A style swap removes these for us, so every teardown step is guarded.
      for (const id of [SOLID_LAYER_ID, DASHED_LAYER_ID, HIGHLIGHT_LAYER_ID]) {
        if (map.getLayer(id)) {
          map.removeLayer(id)
        }
      }
      for (const id of [
        SOURCE_ID,
        `${SOURCE_ID}-dashed`,
        HIGHLIGHT_SOURCE_ID,
      ]) {
        if (map.getSource(id)) {
          map.removeSource(id)
        }
      }
    }
  }, [map])

  useEffect(() => {
    const source = map.getSource(SOURCE_ID)
    const dashedSource = map.getSource(`${SOURCE_ID}-dashed`)
    if (source?.type === "geojson" && dashedSource?.type === "geojson") {
      source.setData(solid)
      dashedSource.setData(dashed)
    }
  }, [map, solid, dashed])

  useEffect(() => {
    const source = map.getSource(HIGHLIGHT_SOURCE_ID)
    if (source?.type === "geojson") {
      source.setData(highlight)
    }
  }, [map, highlight])

  useEffect(() => {
    const value = visible ? "visible" : "none"
    for (const id of [SOLID_LAYER_ID, DASHED_LAYER_ID]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", value)
      }
    }
  }, [map, visible])

  return null
}
