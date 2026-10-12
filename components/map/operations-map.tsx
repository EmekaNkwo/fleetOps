"use client"

import { useCallback, useState } from "react"
import dynamic from "next/dynamic"
import {
  CrosshairIcon,
  GridIcon,
  RouteIcon,
  WifiOffIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/formatting"
import { LoadingPanel } from "@/components/shared/spinner"
import { useFleet, useMap } from "@/hooks"
import { MapLegend } from "./map-legend"

/**
 * Mapbox GL touches `window` on import, so the whole map chunk is client-only
 * and lazily loaded. It is also the heaviest dependency in the app — keeping it
 * out of the initial bundle is what lets the shell paint immediately.
 */
const MapboxMap = dynamic(() => import("./mapbox-map"), {
  ssr: false,
  loading: () => (
    <LoadingPanel message="Loading basemap" className="ops-sunken" />
  ),
})

interface OperationsMapProps {
  /** Changes when the surrounding layout resizes, so the map can re-measure. */
  readonly layoutKey: string
}

/**
 * Live map container: chrome, controls and status, with the Mapbox surface
 * lazily mounted inside. All map logic comes from `useMap`.
 */
export function OperationsMap({ layoutKey }: OperationsMapProps) {
  const map = useMap()
  const vehicleCount = useFleet().counts.total
  const [basemapUnavailable, setBasemapUnavailable] = useState(false)
  const [drawn, setDrawn] = useState(0)

  const onFrame = useCallback((count: number) => {
    setDrawn(count)
  }, [])

  return (
    // `isolate` keeps the map's own stacking — its controls, the canvas overlay
    // and the status chrome below — from competing with the app's dialogs and
    // slide-overs.
    <div className="relative size-full isolate overflow-hidden">
      <MapboxMap
        map={map}
        layoutKey={layoutKey}
        onTileStatusChange={setBasemapUnavailable}
        onFrame={onFrame}
      />

      {/* The canvas is aria-hidden, so the map's data is described here and
          navigable through the fleet list in the left rail. */}
      <p className="sr-only" aria-live="polite">
        {map.densityView
          ? `Fleet density view, covering ${formatNumber(drawn)} of ${formatNumber(vehicleCount)} vehicles grouped into map cells.`
          : `Live map showing ${formatNumber(drawn)} of ${formatNumber(vehicleCount)} vehicles.`}{" "}
        The fleet list in the overview panel provides the same information in a
        keyboard-navigable form.
      </p>

      <div className="absolute top-2 right-2 z-[500] flex items-center gap-1">
        <Button
          variant={map.showRoutes ? "default" : "outline"}
          size="icon-sm"
          onClick={() => map.setShowRoutes(!map.showRoutes)}
          aria-label={
            map.showRoutes ? "Hide corridor overlay" : "Show corridor overlay"
          }
          aria-pressed={map.showRoutes}
          title="Toggle corridor overlay"
        >
          <RouteIcon aria-hidden="true" />
        </Button>
        <Button
          variant={map.densityView ? "default" : "outline"}
          size="icon-sm"
          onClick={() => map.setDensityView(!map.densityView)}
          aria-label={
            map.densityView
              ? "Show individual vehicles"
              : "Show fleet density instead of individual vehicles"
          }
          aria-pressed={map.densityView}
          title="Toggle density view"
        >
          <GridIcon aria-hidden="true" />
        </Button>
        <Button
          variant={map.followSelection ? "default" : "outline"}
          size="icon-sm"
          onClick={() => map.setFollowSelection(!map.followSelection)}
          disabled={!map.selectedVehicleId}
          aria-label="Follow the selected vehicle"
          aria-pressed={map.followSelection}
          title="Follow selected vehicle"
        >
          <CrosshairIcon aria-hidden="true" />
        </Button>
      </div>

      <div
        className={cn(
          "absolute top-2 left-2 z-[500] rounded border border-border bg-card/95 px-2 py-1 backdrop-blur-sm",
          "text-[11px] text-muted-foreground"
        )}
      >
        <span className="ops-figure text-foreground">{formatNumber(drawn)}</span>{" "}
        vehicles drawn
        {drawn !== vehicleCount ? (
          <span> · {formatNumber(vehicleCount - drawn)} filtered or off-screen</span>
        ) : null}
      </div>

      {basemapUnavailable ? (
        <div className="absolute inset-x-0 top-11 z-[500] mx-auto w-fit rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <span className="flex items-center gap-1.5">
            <WifiOffIcon className="size-3.5" aria-hidden="true" />
            Basemap unavailable — showing coordinate grid. Vehicle tracking is
            unaffected.
          </span>
        </div>
      ) : null}

      <MapLegend />
    </div>
  )
}
