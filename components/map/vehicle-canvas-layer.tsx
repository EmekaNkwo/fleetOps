"use client"

import { useCallback, useEffect, useRef } from "react"
import { MOVEMENT_INTERVAL_MS } from "@/data/config"
import { readCameraViewport } from "@/lib/map/camera"
import {
  createDensityGrid,
  renderDensity,
} from "@/lib/map/density-renderer"
import {
  createHitIndex,
  hitTest,
  renderVehicles,
  type RenderViewport,
} from "@/lib/map/vehicle-renderer"
import { useMapbox } from "./map-context"
import type { TelemetryBuffer, TelemetrySample } from "@/services/simulation"

interface VehicleCanvasLayerProps {
  readonly telemetry: TelemetryBuffer
  readonly selectedVehicleId: string | null
  readonly drawGraticule: boolean
  /** Paints a bucketed density field instead of individual vehicles. */
  readonly density: boolean
  matchesFilter(sample: TelemetrySample): boolean
  colourFor(sample: TelemetrySample): string
  onSelect(vehicleId: string): void
  onEmptyClick(): void
  onFrame(drawn: number): void
}

const MAX_VEHICLES = 4_000

/** Pointer travel beyond this counts as a pan, not a click. */
const DRAG_THRESHOLD_PX = 4

/**
 * Canvas overlay that paints the fleet on top of the basemap.
 *
 * It mounts one `<canvas>` and one `requestAnimationFrame` loop, then never
 * re-renders: positions are pulled from the telemetry buffer inside the loop.
 * React is responsible for the canvas existing, not for anything drawn on it.
 */
export function VehicleCanvasLayer({
  telemetry,
  selectedVehicleId,
  drawGraticule,
  density,
  matchesFilter,
  colourFor,
  onSelect,
  onEmptyClick,
  onFrame,
}: VehicleCanvasLayerProps) {
  const map = useMapbox()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hitIndexRef = useRef(createHitIndex(MAX_VEHICLES))
  const densityGridRef = useRef(createDensityGrid())
  const frameRef = useRef<number | null>(null)
  const redrawRef = useRef(true)

  // Props are mirrored into refs so changing a filter or the selection does not
  // restart the animation loop.
  const propsRef = useRef({
    selectedVehicleId,
    drawGraticule,
    density,
    matchesFilter,
    colourFor,
    onFrame,
  })
  propsRef.current = {
    selectedVehicleId,
    drawGraticule,
    density,
    matchesFilter,
    colourFor,
    onFrame,
  }

  // Filters and colours live in a ref, so changing one is invisible to the
  // frame-skip check below. This flags a single forced redraw instead.
  useEffect(() => {
    redrawRef.current = true
  }, [matchesFilter, colourFor, density])

  const readViewport = useCallback(
    (): RenderViewport | null => readCameraViewport(map),
    [map]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d", { alpha: true })
    if (!canvas || !context) {
      return
    }

    const styles = getComputedStyle(map.getContainer())

    let lastWidth = 0
    let lastHeight = 0
    let frameCount = 0
    // Frame-skip bookkeeping: redraw only when something could look different.
    let lastSignature = ""
    let lastTelemetryVersion = -1

    const resize = (viewport: RenderViewport): void => {
      if (viewport.width === lastWidth && viewport.height === lastHeight) {
        return
      }
      lastWidth = viewport.width
      lastHeight = viewport.height
      canvas.width = Math.round(viewport.width * viewport.dpr)
      canvas.height = Math.round(viewport.height * viewport.dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
    }

    const draw = (): void => {
      frameRef.current = requestAnimationFrame(draw)

      const viewport = readViewport()
      if (!viewport) {
        return
      }
      resize(viewport)

      const current = propsRef.current
      const nowReal = performance.now()

      // Positions are interpolated between integration ticks, so a frame is
      // only redundant once that interpolation has finished and nothing new
      // has arrived. When the simulation is paused that happens after one
      // second, and the loop then costs nothing until the operator acts.
      const interpolating =
        nowReal - telemetry.lastWriteAt() < MOVEMENT_INTERVAL_MS
      const signature = `${viewport.zoom}|${viewport.originX}|${viewport.originY}|${viewport.width}|${viewport.height}|${current.selectedVehicleId ?? ""}|${current.drawGraticule}|${current.density}`
      const telemetryVersion = telemetry.version()

      if (
        !redrawRef.current &&
        !interpolating &&
        telemetryVersion === lastTelemetryVersion &&
        signature === lastSignature
      ) {
        return
      }
      redrawRef.current = false

      lastSignature = signature
      lastTelemetryVersion = telemetryVersion

      const gridColour = styles.getPropertyValue("--grid-line").trim() || "#8882"
      const labelColour = styles.getPropertyValue("color").trim() || "#111"

      // In density mode the hit index is emptied rather than left stale: a
      // click must not select a vehicle whose chevron is no longer drawn.
      let drawn: number
      if (current.density) {
        hitIndexRef.current.count = 0
        drawn = renderDensity(
          context,
          telemetry,
          {
            viewport,
            nowReal,
            matchesFilter: current.matchesFilter,
            drawGraticule: current.drawGraticule,
            gridColour,
            labelColour,
          },
          densityGridRef.current
        )
      } else {
        drawn = renderVehicles(
          context,
          telemetry,
          {
            viewport,
            selectedVehicleId: current.selectedVehicleId,
            nowReal,
            matchesFilter: current.matchesFilter,
            colourFor: current.colourFor,
            drawGraticule: current.drawGraticule,
            gridColour,
            labelColour,
            haloColour:
              styles.getPropertyValue("background-color").trim() || "#fff",
          },
          hitIndexRef.current
        )
      }

      // Report the drawn count roughly twice a second; the status strip does
      // not need it per frame and this keeps React out of the loop.
      frameCount += 1
      if (frameCount % 30 === 0) {
        current.onFrame(drawn)
      }
    }

    frameRef.current = requestAnimationFrame(draw)

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [map, readViewport, telemetry])

  // Clicks and hover are hit-tested against the index the renderer just built.
  useEffect(() => {
    const container = map.getContainer()
    const surface = map.getCanvas()
    let downX = 0
    let downY = 0
    let dragged = false

    /**
     * Vehicles are painted, not DOM nodes, so the cursor has to be driven from
     * the same hit test the click uses — otherwise the map's grab cursor claims
     * a chevron is not clickable when it is.
     *
     * Written inline on the basemap canvas, which overrides the grab cursor
     * Mapbox puts on the container. An empty value hands it back. Zone
     * placement owns the cursor outright while it is active, so this leaves a
     * crosshair alone.
     */
    const setCursor = (value: string): void => {
      if (surface.style.cursor === "crosshair") {
        return
      }
      if (surface.style.cursor !== value) {
        surface.style.cursor = value
      }
    }

    const hitAt = (clientX: number, clientY: number): string | null => {
      const bounds = container.getBoundingClientRect()
      return hitTest(
        hitIndexRef.current,
        clientX - bounds.left,
        clientY - bounds.top
      )
    }

    const onPointerDown = (event: PointerEvent): void => {
      downX = event.clientX
      downY = event.clientY
      dragged = false
    }

    const onPointerMove = (event: PointerEvent): void => {
      if (event.buttons === 0) {
        setCursor(hitAt(event.clientX, event.clientY) ? "pointer" : "")
        return
      }

      // Mid-drag the map is being panned, so Mapbox's grabbing cursor is the
      // honest one.
      setCursor("")

      // A few pixels of slop: a deliberate click still wobbles slightly.
      if (
        Math.abs(event.clientX - downX) > DRAG_THRESHOLD_PX ||
        Math.abs(event.clientY - downY) > DRAG_THRESHOLD_PX
      ) {
        dragged = true
      }
    }

    const onPointerLeave = (): void => {
      setCursor("")
    }

    const onClick = (event: MouseEvent): void => {
      // Panning the map ends in a `click` on the container. Treating that as a
      // selection gesture cleared whatever the operator was watching every
      // time they moved the map.
      if (dragged) {
        return
      }

      // Mapbox's own controls (zoom, attribution, logo) live inside the
      // container, so their clicks bubble here too and must not reach the hit
      // test.
      if (
        event.target instanceof Element &&
        event.target.closest(".mapboxgl-ctrl")
      ) {
        return
      }

      const hit = hitAt(event.clientX, event.clientY)

      if (hit) {
        onSelect(hit)
        return
      }
      onEmptyClick()
    }

    container.addEventListener("pointerdown", onPointerDown)
    container.addEventListener("pointermove", onPointerMove)
    container.addEventListener("pointerleave", onPointerLeave)
    container.addEventListener("click", onClick)

    return () => {
      container.removeEventListener("pointerdown", onPointerDown)
      container.removeEventListener("pointermove", onPointerMove)
      container.removeEventListener("pointerleave", onPointerLeave)
      container.removeEventListener("click", onClick)
      setCursor("")
    }
  }, [map, onEmptyClick, onSelect])

  return (
    // Above the WebGL basemap but below Mapbox's controls, which sit at
    // z-index 2 inside the same stacking context.
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1]"
    />
  )
}
