import {
  createProjectionFrame,
  projectX,
  projectY,
} from "./projection"
import type { TelemetryBuffer, TelemetrySample } from "@/services/simulation"
import type { RenderViewport } from "./vehicle-renderer"

export interface DensityOptions {
  readonly viewport: RenderViewport
  readonly nowReal: number
  matchesFilter(sample: TelemetrySample): boolean
  /** Drawn behind the field when basemap tiles are unavailable. */
  readonly drawGraticule: boolean
  readonly gridColour: string
  readonly labelColour: string
}

/**
 * Edge length of a bucket, in CSS pixels.
 *
 * Fixed in screen space rather than in degrees, so zooming in genuinely
 * resolves a cluster into its parts instead of redrawing the same blob larger.
 */
const CELL_PX = 34

/** Vehicles in one cell at which the field reaches full intensity. */
const SATURATION_COUNT = 8

/**
 * Colour ramp, cold to hot. Written as plain triples so the hot path can
 * interpolate without parsing a colour string or allocating.
 */
const RAMP: readonly (readonly [number, number, number])[] = [
  [56, 189, 248],
  [52, 211, 153],
  [250, 204, 21],
  [249, 115, 22],
  [239, 68, 68],
]

function rampColour(t: number, alpha: number): string {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t
  const scaled = clamped * (RAMP.length - 1)
  const index = Math.min(RAMP.length - 2, Math.floor(scaled))
  const local = scaled - index

  const from = RAMP[index] ?? RAMP[0]
  const to = RAMP[index + 1] ?? RAMP[RAMP.length - 1]
  if (!from || !to) {
    return `rgba(148, 163, 184, ${alpha})`
  }

  const r = Math.round(from[0] + (to[0] - from[0]) * local)
  const g = Math.round(from[1] + (to[1] - from[1]) * local)
  const b = Math.round(from[2] + (to[2] - from[2]) * local)

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * A reused bucket grid.
 *
 * Allocated once per renderer and resized only when the viewport changes, for
 * the same reason the marker path allocates nothing: this runs inside a
 * requestAnimationFrame loop over 500 vehicles, and a fresh array every frame
 * would hand the garbage collector work sixty times a second.
 */
export interface DensityGrid {
  counts: Int32Array
  cols: number
  rows: number
}

export function createDensityGrid(): DensityGrid {
  return { counts: new Int32Array(0), cols: 0, rows: 0 }
}

/**
 * Density field.
 *
 * At national zoom the chevron layer collapses into an unreadable smear over
 * Lagos — five hundred markers in a space that can show perhaps fifty. This
 * answers the question that view is actually being asked: where is the fleet
 * concentrated. Individual vehicles come back on zooming in, where there is
 * room for them.
 *
 * Returns how many vehicles were counted, for the layer's status line.
 */
export function renderDensity(
  ctx: CanvasRenderingContext2D,
  telemetry: TelemetryBuffer,
  options: DensityOptions,
  grid: DensityGrid
): number {
  const { viewport } = options
  const frame = createProjectionFrame(
    viewport.zoom,
    viewport.originX,
    viewport.originY
  )

  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0)
  ctx.clearRect(0, 0, viewport.width, viewport.height)

  const cols = Math.max(1, Math.ceil(viewport.width / CELL_PX))
  const rows = Math.max(1, Math.ceil(viewport.height / CELL_PX))

  if (grid.cols !== cols || grid.rows !== rows) {
    grid.counts = new Int32Array(cols * rows)
    grid.cols = cols
    grid.rows = rows
  } else {
    grid.counts.fill(0)
  }

  let total = 0
  let peak = 0

  for (const sample of telemetry.samples().values()) {
    if (!options.matchesFilter(sample)) {
      continue
    }

    const position = telemetry.interpolate(sample, options.nowReal)
    const x = projectX(position.lng, frame)
    const y = projectY(position.lat, frame)

    if (x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) {
      continue
    }

    const col = Math.min(cols - 1, Math.floor(x / CELL_PX))
    const row = Math.min(rows - 1, Math.floor(y / CELL_PX))
    const cell = row * cols + col

    const next = (grid.counts[cell] ?? 0) + 1
    grid.counts[cell] = next
    if (next > peak) {
      peak = next
    }
    total += 1
  }

  if (options.drawGraticule) {
    ctx.strokeStyle = options.gridColour
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let col = 0; col <= cols; col += 4) {
      ctx.moveTo(col * CELL_PX, 0)
      ctx.lineTo(col * CELL_PX, viewport.height)
    }
    for (let row = 0; row <= rows; row += 4) {
      ctx.moveTo(0, row * CELL_PX)
      ctx.lineTo(viewport.width, row * CELL_PX)
    }
    ctx.stroke()
  }

  // Scale against the busiest cell rather than a constant, so the field still
  // has contrast when the fleet is quiet. The floor keeps a single stray
  // vehicle from being painted as if it were a depot.
  const ceiling = Math.max(SATURATION_COUNT, peak)
  const showCounts = CELL_PX >= 28

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = "600 10px ui-monospace, monospace"

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const count = grid.counts[row * cols + col] ?? 0
      if (count === 0) {
        continue
      }

      const intensity = count / ceiling
      const x = col * CELL_PX
      const y = row * CELL_PX

      ctx.fillStyle = rampColour(intensity, 0.18 + intensity * 0.55)
      ctx.fillRect(x, y, CELL_PX, CELL_PX)

      // The number is the redundant encoding: density has to be readable
      // without relying on the colour ramp alone.
      if (showCounts && count > 1) {
        ctx.fillStyle = options.labelColour
        ctx.fillText(String(count), x + CELL_PX / 2, y + CELL_PX / 2)
      }
    }
  }

  return total
}
