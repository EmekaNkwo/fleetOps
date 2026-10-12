import {
  createProjectionFrame,
  projectX,
  projectY,
  type ProjectionFrame,
} from "./projection"
import type { TelemetryBuffer, TelemetrySample } from "@/services/simulation"

export interface RenderViewport {
  readonly width: number
  readonly height: number
  readonly zoom: number
  readonly originX: number
  readonly originY: number
  readonly dpr: number
}

export interface RenderOptions {
  readonly viewport: RenderViewport
  readonly selectedVehicleId: string | null
  readonly nowReal: number
  matchesFilter(sample: TelemetrySample): boolean
  colourFor(sample: TelemetrySample): string
  /** Drawn behind the markers when basemap tiles are unavailable. */
  readonly drawGraticule: boolean
  readonly gridColour: string
  readonly labelColour: string
  readonly haloColour: string
}

/** Flat hit-test index rebuilt each frame; no per-vehicle objects. */
export interface HitIndex {
  readonly ids: string[]
  readonly xs: Float32Array
  readonly ys: Float32Array
  count: number
}

export function createHitIndex(capacity: number): HitIndex {
  return {
    ids: new Array<string>(capacity),
    xs: new Float32Array(capacity),
    ys: new Float32Array(capacity),
    count: 0,
  }
}

/** Nearest drawn vehicle within `radius` pixels, or null. */
export function hitTest(
  index: HitIndex,
  x: number,
  y: number,
  radius = 12
): string | null {
  let bestId: string | null = null
  let bestDistance = radius * radius

  for (let i = 0; i < index.count; i += 1) {
    const dx = (index.xs[i] ?? 0) - x
    const dy = (index.ys[i] ?? 0) - y
    const distance = dx * dx + dy * dy
    if (distance <= bestDistance) {
      bestDistance = distance
      bestId = index.ids[i] ?? null
    }
  }

  return bestId
}

/**
 * Marker size grows with zoom so the map stays readable at both extremes.
 * Thresholds are Mapbox zoom levels — 512px world tiles, one level coarser
 * than the raster-tile convention.
 */
function markerSize(zoom: number): number {
  if (zoom <= 5) {
    return 4
  }
  if (zoom <= 7) {
    return 5.5
  }
  if (zoom <= 9) {
    return 7
  }
  return 9
}

function drawGraticuleLines(
  ctx: CanvasRenderingContext2D,
  frame: ProjectionFrame,
  viewport: RenderViewport,
  colour: string
): void {
  ctx.save()
  ctx.strokeStyle = colour
  ctx.lineWidth = 1
  ctx.setLineDash([2, 4])

  // One degree graticule: enough structure to read position without tiles.
  for (let lat = 4; lat <= 14; lat += 1) {
    const y = projectY(lat, frame)
    if (y < -20 || y > viewport.height + 20) {
      continue
    }
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(viewport.width, y)
    ctx.stroke()
  }

  for (let lng = 2; lng <= 15; lng += 1) {
    const x = projectX(lng, frame)
    if (x < -20 || x > viewport.width + 20) {
      continue
    }
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, viewport.height)
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * Draws every visible vehicle for one frame and returns the hit index.
 *
 * This is the whole reason the map is a canvas layer: 500 DOM markers with
 * CSS transforms cannot hold 60fps, and routing position through React state
 * would reconcile the tree on every telemetry packet. Here one function reads
 * the telemetry buffer, interpolates, projects and paints — with no React
 * involvement and no allocation in the loop.
 */
export function renderVehicles(
  ctx: CanvasRenderingContext2D,
  telemetry: TelemetryBuffer,
  options: RenderOptions,
  index: HitIndex
): number {
  const { viewport } = options
  const frame = createProjectionFrame(
    viewport.zoom,
    viewport.originX,
    viewport.originY
  )

  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0)
  ctx.clearRect(0, 0, viewport.width, viewport.height)

  if (options.drawGraticule) {
    drawGraticuleLines(ctx, frame, viewport, options.gridColour)
  }

  const size = markerSize(viewport.zoom)
  const showLabels = viewport.zoom >= 8
  let drawn = 0
  index.count = 0

  let selectedX = 0
  let selectedY = 0
  let selectedSample: TelemetrySample | null = null

  for (const sample of telemetry.samples().values()) {
    if (!options.matchesFilter(sample)) {
      continue
    }

    const position = telemetry.interpolate(sample, options.nowReal)
    const x = projectX(position.lng, frame)
    const y = projectY(position.lat, frame)

    // Cull generously: a marker just off-screen must not pop in late.
    if (x < -24 || y < -24 || x > viewport.width + 24 || y > viewport.height + 24) {
      continue
    }

    const colour = options.colourFor(sample)
    const isSelected = sample.vehicleId === options.selectedVehicleId

    if (isSelected) {
      selectedX = x
      selectedY = y
      selectedSample = sample
    }

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((position.heading * Math.PI) / 180)
    ctx.beginPath()
    // A chevron: heading is readable at a glance, unlike a circle.
    ctx.moveTo(0, -size)
    ctx.lineTo(size * 0.72, size * 0.78)
    ctx.lineTo(0, size * 0.34)
    ctx.lineTo(-size * 0.72, size * 0.78)
    ctx.closePath()
    ctx.fillStyle = colour
    ctx.fill()

    if (viewport.zoom >= 7) {
      ctx.lineWidth = 1
      ctx.strokeStyle = options.haloColour
      ctx.stroke()
    }
    ctx.restore()

    if (index.count < index.ids.length) {
      index.ids[index.count] = sample.vehicleId
      index.xs[index.count] = x
      index.ys[index.count] = y
      index.count += 1
    }

    if (showLabels && !isSelected) {
      ctx.fillStyle = options.labelColour
      ctx.font = "10px ui-monospace, monospace"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(sample.callSign, x + size + 3, y)
    }

    drawn += 1
  }

  // The selection is painted last so it is never hidden under the fleet.
  if (selectedSample) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(selectedX, selectedY, size + 7, 0, Math.PI * 2)
    ctx.strokeStyle = options.colourFor(selectedSample)
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(selectedX, selectedY, size + 11, 0, Math.PI * 2)
    ctx.globalAlpha = 0.35
    ctx.stroke()
    ctx.globalAlpha = 1

    const label = `${selectedSample.callSign} · ${Math.round(selectedSample.speed)} km/h`
    ctx.font = "600 11px ui-monospace, monospace"
    const width = ctx.measureText(label).width
    const boxX = selectedX + size + 10
    const boxY = selectedY - 9

    ctx.fillStyle = options.haloColour
    ctx.fillRect(boxX, boxY, width + 10, 18)
    ctx.strokeStyle = options.colourFor(selectedSample)
    ctx.lineWidth = 1
    ctx.strokeRect(boxX, boxY, width + 10, 18)

    ctx.fillStyle = options.labelColour
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(label, boxX + 5, boxY + 9)
    ctx.restore()
  }

  return drawn
}
