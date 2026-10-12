"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import mapboxgl, { type Map as MapboxInstance, type StyleSpecification } from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { useTheme } from "next-themes"
import { NIGERIA_BOUNDS } from "@/data/geography"
import { usePrefersReducedMotion } from "@/hooks"
import type { UseMapResult } from "@/hooks"
import { GeofenceLayer } from "./geofence-layer"
import { MapProvider } from "./map-context"
import { MapFocusController, MapResizeController } from "./map-controllers"
import { RouteLayer } from "./route-layer"
import { VehicleCanvasLayer } from "./vehicle-canvas-layer"

interface MapboxMapProps {
  readonly map: UseMapResult
  readonly layoutKey: string
  onTileStatusChange(unavailable: boolean): void
  onFrame(drawn: number): void
}

/**
 * Mapbox access token.
 *
 * Read from `NEXT_PUBLIC_MAPBOX_TOKEN` at build time. Without one the map falls
 * back to the empty style below: panning, zooming, the corridor overlay and the
 * whole fleet still work, drawn over a coordinate graticule instead of a
 * basemap. A clone with no `.env` therefore still runs — it just has no tiles.
 */
const ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ""

/**
 * Mapbox's own light and dark styles. Having a real dark basemap is why the
 * previous CSS tile-inversion hack is gone: the dark style is designed to be
 * dark, rather than a light raster with its hue rotated.
 */
const LIGHT_STYLE = "mapbox://styles/mapbox/light-v11"
const DARK_STYLE = "mapbox://styles/mapbox/dark-v11"

/** Used when there is no token, or when a style request fails outright. */
const EMPTY_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      // Transparent so the container's own surface colour shows through, which
      // keeps the empty basemap themed with the rest of the console.
      paint: { "background-color": "rgba(0, 0, 0, 0)" },
    },
  ],
}

/** Consecutive tile failures before the map falls back to the graticule. */
const TILE_FAILURE_THRESHOLD = 6

/**
 * Zoom limits, as Mapbox levels — 512px world tiles, one level coarser than
 * the raster-tile convention.
 */
const MIN_ZOOM = 4
const MAX_ZOOM = 12

/** Tile-level errors carry the source they came from; style errors do not. */
interface MapErrorDetail {
  readonly sourceId?: string
}

function styleFor(dark: boolean): string | StyleSpecification {
  if (!ACCESS_TOKEN) {
    return EMPTY_STYLE
  }
  return dark ? DARK_STYLE : LIGHT_STYLE
}

/**
 * The Mapbox GL surface: one map instance, its camera and basemap, with every
 * data layer mounted as a child against the shared instance.
 *
 * Rotation and pitch are disabled deliberately. The fleet is drawn on a 2D
 * canvas overlay projected from the camera's centre and zoom, which only lines
 * up with the basemap while bearing and pitch are zero. A tilted basemap is
 * also the wrong tool for reading a national fleet at a glance.
 */
export default function MapboxMap({
  map: mapData,
  layoutKey,
  onTileStatusChange,
  onFrame,
}: MapboxMapProps) {
  const reducedMotion = usePrefersReducedMotion()
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [instance, setInstance] = useState<MapboxInstance | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  /**
   * No basemap under the fleet: no token, or tiles that will not load. Drives
   * the graticule as well as the status banner, so the operator always has
   * some frame of reference.
   */
  const [basemapUnavailable, setBasemapUnavailable] = useState(!ACCESS_TOKEN)
  /**
   * Zero while no style is loaded, and bumped on every style load.
   *
   * Layer children are mounted on this and keyed by it. A style that is loading
   * — or being rebuilt after a rejected one — rejects `addSource`, and swapping
   * a style discards whatever was added to the previous one, so the layers have
   * to come and go with the style rather than with the map.
   */
  const [styleReady, setStyleReady] = useState(0)

  const wantsDark = resolvedTheme === "dark"
  const style = useMemo(() => styleFor(wantsDark), [wantsDark])

  // The initial style is read from a ref so a theme change does not tear the
  // whole map down and reload it; the effect below swaps the style in place.
  const initialStyleRef = useRef(style)
  const statusRef = useRef(onTileStatusChange)
  statusRef.current = onTileStatusChange
  /** Set once a style request has failed; keeps the map on the empty style. */
  const styleFailedRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    if (ACCESS_TOKEN) {
      mapboxgl.accessToken = ACCESS_TOKEN
    }

    let created: MapboxInstance
    try {
      created = new mapboxgl.Map({
        container,
        style: initialStyleRef.current,
        center: [
          mapData.defaultView.center.lng,
          mapData.defaultView.center.lat,
        ],
        zoom: mapData.defaultView.zoom,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        maxBounds: [
          [NIGERIA_BOUNDS.west - 3, NIGERIA_BOUNDS.south - 2],
          [NIGERIA_BOUNDS.east + 3, NIGERIA_BOUNDS.north + 2],
        ],
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: true,
        // Mapbox's own styles render on a globe, which is a different screen
        // mapping entirely. The fleet is painted on a flat Mercator canvas over
        // the top, so a globe basemap would put every vehicle somewhere other
        // than where the basemap says it is — in practice off-screen and culled.
        projection: { name: "mercator" },
      })
    } catch {
      // Mapbox GL needs WebGL. Where it is unavailable there is no camera to
      // project against, so the surface reports itself rather than throwing
      // inside render.
      setUnsupported(true)
      return
    }

    created.touchZoomRotate.disableRotation()
    created.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "bottom-right"
    )

    let failures = 0
    let fellBack = false

    const report = (unavailable: boolean): void => {
      setBasemapUnavailable(unavailable)
      statusRef.current(unavailable)
    }

    const onError = (event: unknown): void => {
      const detail = event as MapErrorDetail

      // A style that never arrives — most often a missing or rejected token —
      // would leave `load` unfired and the fleet unmounted. Dropping to the
      // empty style recovers into graticule mode instead.
      if (!detail.sourceId) {
        if (!fellBack && !created.isStyleLoaded()) {
          fellBack = true
          styleFailedRef.current = true
          report(true)
          setStyleReady(0)
          created.setStyle(EMPTY_STYLE)
        }
        return
      }

      failures += 1
      if (failures === TILE_FAILURE_THRESHOLD) {
        report(true)
      }
    }

    const onData = (event: { dataType: string; tile?: unknown }): void => {
      if (event.dataType !== "source" || !event.tile) {
        return
      }
      if (failures > 0) {
        failures = 0
        report(false)
      }
    }

    const onStyleLoad = (): void => {
      // A style carries its own projection, so this is re-asserted on every
      // load rather than only at construction.
      created.setProjection({ name: "mercator" })
      setStyleReady((previous) => previous + 1)
    }

    created.on("error", onError)
    created.on("data", onData)
    created.on("style.load", onStyleLoad)
    created.on("load", () => {
      setInstance(created)
    })

    return () => {
      created.remove()
      setInstance(null)
    }
    // Mounted once: the camera's starting position is an initial value, and the
    // style is swapped in place by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // With no token there is nothing to wait for: the banner and the graticule
  // should be up from the first frame.
  useEffect(() => {
    if (!ACCESS_TOKEN) {
      statusRef.current(true)
    }
  }, [])

  // Theme switches swap the basemap in place. `setStyle` discards every source
  // and layer the children added, which is what `styleReady` is for.
  //
  // The equality guard is load-bearing: without it this fires on mount with the
  // style the map already has, wiping the layers the children added moments
  // earlier in the same commit — and an unchanged style raises no `style.load`,
  // so they would never be re-added.
  const appliedStyleRef = useRef(style)
  useEffect(() => {
    // Once a style has been rejected, asking for its dark twin will be rejected
    // too; the empty basemap stays rather than flickering through the failure
    // again on every theme switch.
    if (!instance || styleFailedRef.current || appliedStyleRef.current === style) {
      return
    }
    // Swapping a style that is still arriving makes Mapbox discard the diff and
    // rebuild from scratch, which leaves the style unloaded for a while and the
    // layers with nothing to attach to. Waiting costs one frame of the old
    // basemap.
    const swap = (): void => {
      appliedStyleRef.current = style
      setStyleReady(0)
      instance.setStyle(style)
    }

    if (!instance.isStyleLoaded()) {
      instance.once("style.load", swap)
      return () => {
        instance.off("style.load", swap)
      }
    }
    swap()
  }, [instance, style])

  if (unsupported) {
    return (
      <div className="ops-sunken flex size-full items-center justify-center p-4">
        <p className="max-w-sm text-center text-xs text-muted-foreground">
          The basemap needs WebGL, which this browser has not made available.
          Fleet data remains available in the overview panel and the board.
        </p>
      </div>
    )
  }

  return (
    <div className="relative size-full">
      {/* Sized rather than inset: mapbox-gl.css pins `.mapboxgl-map` to
          `position: relative` and loads after Tailwind, so `absolute inset-0`
          would lose the cascade and collapse the container to zero height. */}
      <div ref={containerRef} className="size-full" />

      {instance ? (
        <MapProvider value={instance}>
          {/* Mounted with the style and keyed by it: a style swap wipes their
              sources, and a style that is still loading refuses new ones. The
              fleet canvas and the camera below outlive both. */}
          {styleReady > 0 ? (
            <>
              <RouteLayer
                key={`routes-${styleReady}`}
                lines={mapData.routeLines}
                highlighted={mapData.highlightedRoute}
                visible={mapData.showRoutes}
              />
              <GeofenceLayer
                key={`zones-${styleReady}`}
                zones={mapData.zones}
                placing={mapData.placingZone}
                onPlace={mapData.placeZone}
              />
            </>
          ) : null}

          <VehicleCanvasLayer
            telemetry={mapData.telemetry}
            selectedVehicleId={mapData.selectedVehicleId}
            density={mapData.densityView}
            drawGraticule={basemapUnavailable}
            matchesFilter={mapData.matchesFilter}
            colourFor={mapData.colourFor}
            onSelect={mapData.selectVehicle}
            onEmptyClick={mapData.clearSelection}
            onFrame={onFrame}
          />

          <MapFocusController
            focusRequest={mapData.focusRequest}
            followVehicleId={
              mapData.followSelection ? mapData.selectedVehicleId : null
            }
            telemetry={mapData.telemetry}
            reducedMotion={reducedMotion}
            onConsumed={mapData.consumeFocus}
          />

          <MapResizeController layoutKey={layoutKey} />
        </MapProvider>
      ) : null}
    </div>
  )
}
