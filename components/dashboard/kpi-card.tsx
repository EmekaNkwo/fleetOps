"use client"

import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatSigned } from "@/lib/formatting"
import type { KpiDefinition } from "@/hooks"

interface KpiCardProps {
  readonly kpi: KpiDefinition
  readonly active?: boolean
  readonly onSelect?: (kpi: KpiDefinition) => void
}

const POLARITY_CLASSES = {
  good: "text-emerald-600 dark:text-emerald-400",
  bad: "text-red-600 dark:text-red-400",
  neutral: "text-muted-foreground",
} as const

const DIRECTION_ICONS = {
  up: ArrowUpRightIcon,
  down: ArrowDownRightIcon,
  flat: ArrowRightIcon,
} as const

/**
 * One operational number plus its movement since the shift baseline.
 *
 * Cards whose KPI maps onto a delivery status are interactive: clicking
 * "Delayed" filters the whole console to delayed deliveries. That is the point
 * of the overview — it is a set of entry points, not a scoreboard.
 */
export function KpiCard({ kpi, active = false, onSelect }: KpiCardProps) {
  const interactive = Boolean(kpi.drilldown && onSelect)
  const TrendIcon = kpi.trend ? DIRECTION_ICONS[kpi.trend.direction] : null

  const content = (
    <>
      <span className="ops-label block truncate">{kpi.label}</span>
      <span className="ops-figure mt-1 block text-2xl leading-none font-semibold">
        {kpi.display}
      </span>
      {kpi.trend && kpi.trend.delta !== 0 ? (
        <span
          className={cn(
            "mt-1.5 flex items-center gap-1 text-[11px]",
            POLARITY_CLASSES[kpi.trend.polarity]
          )}
        >
          {TrendIcon ? (
            <TrendIcon className="size-3 shrink-0" aria-hidden="true" />
          ) : null}
          <span className="ops-figure">{formatSigned(kpi.trend.delta)}</span>
          <span className="truncate text-muted-foreground">{kpi.trend.since}</span>
        </span>
      ) : (
        <span className="mt-1.5 block truncate text-[11px] text-muted-foreground">
          {kpi.trend ? `no change ${kpi.trend.since}` : "live"}
        </span>
      )}
    </>
  )

  if (!interactive) {
    return (
      <div className="border border-border bg-card px-2.5 py-2">{content}</div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onSelect?.(kpi)}
      aria-pressed={active}
      className={cn(
        "border bg-card px-2.5 py-2 text-left transition-colors",
        "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active ? "border-primary bg-accent" : "border-border"
      )}
    >
      {content}
    </button>
  )
}
