import { cn } from "@/lib/utils"
import {
  TRAFFIC_TOKENS,
  VEHICLE_STATUS_ORDER,
  VEHICLE_STATUS_TOKENS,
} from "@/lib/status-tokens"
import type { TrafficLevel } from "@/types"

const TRAFFIC_LEVELS: readonly TrafficLevel[] = ["normal", "slow", "congested"]

/**
 * Map key. Shows the glyph alongside the colour, matching exactly what the
 * canvas draws, so the legend stays useful in greyscale.
 */
export function MapLegend({ className }: { readonly className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-2 left-2 z-[500] space-y-1.5 rounded border border-border bg-card/95 px-2 py-1.5 backdrop-blur-sm",
        className
      )}
    >
      <p className="ops-label">Vehicle status</p>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {VEHICLE_STATUS_ORDER.map((status) => {
          const token = VEHICLE_STATUS_TOKENS[status]
          return (
            <li
              key={status}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
            >
              <span
                aria-hidden="true"
                className={cn("size-1.5 rounded-full", token.dotClassName)}
              />
              <span aria-hidden="true" className="text-[8px]">
                {token.glyph}
              </span>
              {token.label}
            </li>
          )
        })}
      </ul>
      <p className="ops-label pt-0.5">Corridor traffic</p>
      <ul className="flex gap-3">
        {TRAFFIC_LEVELS.map((level) => (
          <li
            key={level}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-0.5 w-4",
                level === "congested" && "bg-red-500",
                level === "slow" && "bg-amber-400",
                level === "normal" && "bg-emerald-500"
              )}
              style={
                level === "congested"
                  ? {
                      backgroundImage: `repeating-linear-gradient(90deg, ${TRAFFIC_TOKENS.congested.canvas} 0 4px, transparent 4px 7px)`,
                      backgroundColor: "transparent",
                    }
                  : undefined
              }
            />
            {TRAFFIC_TOKENS[level].label}
          </li>
        ))}
      </ul>
    </div>
  )
}
