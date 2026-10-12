import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  FlagIcon,
  PackageCheckIcon,
  TrafficConeIcon,
  TruckIcon,
  WrenchIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatClock } from "@/lib/formatting"
import type { TimelineEntry, TimelineEntryKind } from "@/types"

const ICONS: Readonly<Record<TimelineEntryKind, LucideIcon>> = {
  created: PackageCheckIcon,
  assigned: TruckIcon,
  pickup: PackageCheckIcon,
  departed: TruckIcon,
  in_transit: TruckIcon,
  traffic: TrafficConeIcon,
  delay: ClockIcon,
  incident: WrenchIcon,
  eta_revised: AlertTriangleIcon,
  recovered: CheckIcon,
  arrival: FlagIcon,
  cancelled: XIcon,
}

/** Entry kinds that represent a problem, rather than normal progress. */
const PROBLEM_KINDS = new Set<TimelineEntryKind>([
  "traffic",
  "delay",
  "incident",
  "eta_revised",
  "cancelled",
])

interface DeliveryTimelineProps {
  readonly entries: readonly TimelineEntry[]
  readonly className?: string
}

/**
 * Journey timeline.
 *
 * Three visual states carry the meaning: settled history, the live position,
 * and what is still expected. Problems are marked with their own icon and hue
 * so a dispatcher can see *where* in the journey things went wrong, not just
 * that they did.
 */
export function DeliveryTimeline({ entries, className }: DeliveryTimelineProps) {
  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No journey events recorded yet.
      </p>
    )
  }

  return (
    <ol className={cn("relative space-y-0", className)}>
      {entries.map((entry, index) => {
        const Icon = ICONS[entry.kind]
        const isProblem = PROBLEM_KINDS.has(entry.kind)
        const isLast = index === entries.length - 1

        return (
          <li key={entry.id} className="relative flex gap-2.5 pb-3 last:pb-0">
            {!isLast ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-5 left-[9px] h-[calc(100%-0.75rem)] w-px",
                  entry.state === "upcoming" ? "bg-border" : "bg-border"
                )}
              />
            ) : null}

            <span
              aria-hidden="true"
              className={cn(
                "relative z-10 grid size-[19px] shrink-0 place-items-center rounded-full border",
                entry.state === "upcoming" &&
                  "border-dashed border-border bg-card text-muted-foreground",
                entry.state === "active" &&
                  "border-primary bg-primary text-primary-foreground",
                entry.state === "done" && !isProblem &&
                  "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                entry.state === "done" && isProblem &&
                  "border-orange-500/50 bg-orange-500/15 text-orange-700 dark:text-orange-300"
              )}
            >
              <Icon className="size-3" />
            </span>

            <div className="min-w-0 flex-1 pt-px">
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={cn(
                    "truncate text-xs",
                    entry.state === "upcoming"
                      ? "text-muted-foreground"
                      : "font-medium text-foreground"
                  )}
                >
                  {entry.label}
                </p>
                <span className="ops-figure shrink-0 text-[11px] text-muted-foreground">
                  {entry.state === "upcoming" ? "exp. " : ""}
                  {formatClock(entry.at)}
                </span>
              </div>
              {entry.detail ? (
                <p className="mt-0.5 text-[11px] break-words text-muted-foreground">
                  {entry.detail}
                </p>
              ) : null}
              {entry.state === "active" ? (
                <span className="sr-only">Current step</span>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
