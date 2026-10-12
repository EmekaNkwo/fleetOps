"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { TIME_SCALE } from "@/data/config"
import { formatTimestamp } from "@/lib/formatting"
import { operationsNow } from "@/services/simulation/ops-clock"
import { useSimulationStore } from "@/stores"



/**
 * The "is this thing actually live?" readout: a pulsing state lamp, the
 * operations clock, the time-lapse factor and a running event count. Together
 * they make it obvious whether the console is streaming or frozen.
 */
export function LiveIndicator() {
  // Subscribed here rather than passed down: the event counter changes on every
  // tick, and threading it through the header would re-render the whole bar.
  const running = useSimulationStore((state) => state.status.running)
  const eventsEmitted = useSimulationStore(
    (state) => state.status.eventsEmitted
  )
  const [clock, setClock] = useState<string | null>(null)

  useEffect(() => {
    setClock(formatTimestamp(operationsNow()))
    const handle = setInterval(() => {
      setClock(formatTimestamp(operationsNow()))
    }, 1_000)

    return () => {
      clearInterval(handle)
    }
  }, [])

  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-medium",
          running
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-border bg-muted text-muted-foreground"
        )}
        role="status"
        aria-live="polite"
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            running ? "bg-emerald-500 ops-pulse" : "bg-muted-foreground"
          )}
        />
        {running ? "LIVE" : "PAUSED"}
      </span>

      <div className="hidden items-baseline gap-2 md:flex">
        {/* Suppressed until mounted: the clock is client-only by nature. */}
        <span className="ops-figure text-xs text-foreground">
          {clock ?? "--:--:--"}
        </span>
        <span className="text-[10px] text-muted-foreground">
          ×{TIME_SCALE} time-lapse
        </span>
      </div>

      <span className="ops-figure hidden text-[11px] text-muted-foreground lg:inline">
        {eventsEmitted.toLocaleString("en-NG")} events
      </span>
    </div>
  )
}
