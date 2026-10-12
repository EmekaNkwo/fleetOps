"use client"

import { createContext, useContext } from "react"
import type { Map as MapboxMap } from "mapbox-gl"

const MapContext = createContext<MapboxMap | null>(null)

export const MapProvider = MapContext.Provider

/**
 * The live Mapbox instance.
 *
 * Mapbox GL is an imperative library with no React bindings of its own, so the
 * map is created once by `MapboxMap` and handed to its children through
 * context — the role `react-leaflet`'s own `useMap` used to play. Children are
 * mounted only after the style has loaded, so this is never null for them.
 */
export function useMapbox(): MapboxMap {
  const map = useContext(MapContext)
  if (!map) {
    throw new Error("useMapbox must be used inside the map surface")
  }
  return map
}
