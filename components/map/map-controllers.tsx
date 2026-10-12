"use client"

import { useEffect } from "react"
import type { Map as MapboxInstance } from "mapbox-gl"
import type { TelemetryBuffer } from "@/services/simulation"
import type { MapFocusRequest } from "@/stores"
import { useMapbox } from "./map-context"

interface MapFocusControllerProps {
  readonly focusRequest: MapFocusRequest | null
  readonly followVehicleId: string | null
  readonly telemetry: TelemetryBuffer
  readonly reducedMotion: boolean
  onConsumed(): void
}

/** Zoom level used when flying to a single vehicle, as a Mapbox level. */
const FOCUS_ZOOM = 10
/** How often the camera re-centres while following, in milliseconds. */
const FOLLOW_INTERVAL_MS = 1_000
/** Flight and pan durations, in milliseconds. */
const FLY_DURATION_MS = 700
const PAN_DURATION_MS = 600
/**
 * How long the surrounding layout takes to settle before the camera moves.
 *
 * Selecting a vehicle opens a detail panel beside the map, so the map is still
 * narrowing when the focus request arrives. Flying first and resizing second
 * lands the vehicle half a panel off centre, because a resize is anchored to
 * the container's top-left corner. Waiting for the panel costs nothing the
 * operator can see — the panel is animating anyway.
 */
const LAYOUT_SETTLE_MS = 220

/**
 * Whether the map has a viewport to move within.
 *
 * The map tab stays mounted while another tab is on screen, so its container
 * can be `hidden` and therefore zero-sized. A camera animation across a
 * zero-sized viewport divides by that size and produces non-finite
 * coordinates, which the map then rejects. Selecting a vehicle from the fleet
 * rail while the board or analytics tab was open was enough to hit it.
 */
function isLaidOut(map: MapboxInstance): boolean {
  const container = map.getContainer()
  return container.clientWidth > 0 && container.clientHeight > 0
}

/**
 * Camera behaviour, isolated from the rest of the map so it can be reasoned
 * about on its own: a one-shot fly-to when something is selected elsewhere in
 * the app, and an optional follow mode that keeps panning with the vehicle.
 */
export function MapFocusController({
  focusRequest,
  followVehicleId,
  telemetry,
  reducedMotion,
  onConsumed,
}: MapFocusControllerProps) {
  const map = useMapbox()

  useEffect(() => {
    if (!focusRequest) {
      return
    }

    /**
     * Moves the camera, reporting whether it was able to. A request made
     * against a hidden map is held rather than dropped: the operator picked
     * that vehicle, so the map should be looking at it by the time they switch
     * back to it.
     */
    const apply = (animate: boolean): boolean => {
      if (!isLaidOut(map)) {
        return false
      }

      const sample = telemetry.get(focusRequest.vehicleId)
      if (
        sample &&
        Number.isFinite(sample.toLat) &&
        Number.isFinite(sample.toLng)
      ) {
        const center: [number, number] = [sample.toLng, sample.toLat]
        const zoom = Math.max(map.getZoom(), FOCUS_ZOOM)
        if (animate && !reducedMotion) {
          map.flyTo({ center, zoom, duration: FLY_DURATION_MS })
        } else {
          map.jumpTo({ center, zoom })
        }
      }
      return true
    }

    let observer: ResizeObserver | null = null

    const handle = setTimeout(() => {
      if (apply(true)) {
        onConsumed()
        return
      }

      if (typeof ResizeObserver === "undefined") {
        onConsumed()
        return
      }

      // Held until the tab is shown again. Arriving already centred reads
      // better than flying there from a view the operator never saw, so no
      // animation.
      observer = new ResizeObserver(() => {
        if (apply(false)) {
          observer?.disconnect()
          onConsumed()
        }
      })
      observer.observe(map.getContainer())
    }, LAYOUT_SETTLE_MS)

    return () => {
      clearTimeout(handle)
      observer?.disconnect()
    }
  }, [focusRequest, map, onConsumed, reducedMotion, telemetry])

  useEffect(() => {
    if (!followVehicleId) {
      return
    }

    const handle = setInterval(() => {
      const sample = telemetry.get(followVehicleId)
      if (
        sample &&
        isLaidOut(map) &&
        Number.isFinite(sample.toLat) &&
        Number.isFinite(sample.toLng)
      ) {
        map.panTo([sample.toLng, sample.toLat], {
          animate: !reducedMotion,
          duration: PAN_DURATION_MS,
        })
      }
    }, FOLLOW_INTERVAL_MS)

    return () => {
      clearInterval(handle)
    }
  }, [followVehicleId, map, reducedMotion, telemetry])

  return null
}

interface MapResizeControllerProps {
  /** Changes whenever the surrounding layout changes size. */
  readonly layoutKey: string
}

/**
 * Mapbox sizes its drawing buffer from the container, so it must be told when
 * the layout around it changes — opening a detail panel, for instance.
 *
 * A plain `resize()` is anchored to the container's top-left corner, so a panel
 * opening on the right drags the whole view sideways with it. The camera is
 * restored afterwards: what the operator was looking at should not move because
 * something opened next to it. The restore is skipped while the camera is
 * already moving, where re-centring would cancel the flight mid-air.
 */
function resizePreservingCentre(map: MapboxInstance): void {
  const centre = map.getCenter()
  const moving = map.isMoving()
  map.resize()
  if (!moving) {
    map.setCenter(centre)
  }
}

export function MapResizeController({ layoutKey }: MapResizeControllerProps) {
  const map = useMapbox()

  useEffect(() => {
    const handle = setTimeout(() => {
      resizePreservingCentre(map)
    }, 180)

    return () => {
      clearTimeout(handle)
    }
  }, [layoutKey, map])

  useEffect(() => {
    const container = map.getContainer()
    if (typeof ResizeObserver === "undefined") {
      return
    }

    const observer = new ResizeObserver(() => {
      resizePreservingCentre(map)
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [map])

  return null
}
