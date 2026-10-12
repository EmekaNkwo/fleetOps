"use client"

import { useEffect, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { PauseIcon, PlayIcon, RadioIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared/empty-state"
import { formatNumber, formatTimestamp } from "@/lib/formatting"
import { SEVERITY_ORDER, SEVERITY_TOKENS } from "@/lib/status-tokens"
import type { ActivityEvent, SeverityFilter } from "@/types"

interface ActivityFeedProps {
  readonly events: readonly ActivityEvent[]
  readonly total: number
  readonly paused: boolean
  readonly severityFilter: SeverityFilter
  onSetPaused(paused: boolean): void
  onSetSeverityFilter(severity: SeverityFilter): void
  onSelect(event: ActivityEvent): void
}

const ROW_HEIGHT = 30

/**
 * Live event stream.
 *
 * Virtualised because the feed holds hundreds of entries and gains several per
 * second in fast mode. New lines animate in only while the feed is at the top,
 * and the hold button freezes it — scrolling a list that is moving under you is
 * the fastest way to make a live feed useless.
 */
export function ActivityFeed({
  events,
  total,
  paused,
  severityFilter,
  onSetPaused,
  onSetSeverityFilter,
  onSelect,
}: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const previousTopId = useRef<string | null>(null)
  const announcement = useCriticalAnnouncement(events)

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  // Keep the newest line in view, but only when already scrolled to the top.
  useEffect(() => {
    const newestId = events[0]?.id ?? null
    if (newestId === previousTopId.current) {
      return
    }
    previousTopId.current = newestId

    const element = scrollRef.current
    if (element && element.scrollTop <= ROW_HEIGHT * 2) {
      element.scrollTop = 0
    }
  }, [events])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Escalations only, so the announcement stays meaningful. */}
      <p role="status" aria-live="assertive" className="sr-only">
        {announcement}
      </p>

      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <RadioIcon
          className={cn(
            "size-3.5 shrink-0",
            paused ? "text-muted-foreground" : "text-emerald-500"
          )}
          aria-hidden="true"
        />
        <span className="ops-label">Live activity</span>
        <span className="ops-figure text-[10px] text-muted-foreground">
          {formatNumber(total)} total
        </span>

        <div
          className="ml-auto flex items-center gap-1"
          role="group"
          aria-label="Filter activity by severity"
        >
          <SeverityChip
            label="All"
            active={severityFilter === "ALL"}
            onClick={() => onSetSeverityFilter("ALL")}
          />
          {SEVERITY_ORDER.map((severity) => (
            <SeverityChip
              key={severity}
              label={SEVERITY_TOKENS[severity].code}
              title={SEVERITY_TOKENS[severity].label}
              active={severityFilter === severity}
              dotClassName={SEVERITY_TOKENS[severity].dotClassName}
              onClick={() =>
                onSetSeverityFilter(
                  severityFilter === severity ? "ALL" : severity
                )
              }
            />
          ))}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onSetPaused(!paused)}
            aria-label={paused ? "Resume activity feed" : "Hold activity feed"}
            aria-pressed={paused}
          >
            {paused ? (
              <PlayIcon aria-hidden="true" />
            ) : (
              <PauseIcon aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={RadioIcon}
          title="No activity yet"
          description="Start the simulation to begin streaming operational events."
          compact
        />
      ) : (
        <div
          ref={scrollRef}
          className="ops-scroll min-h-0 flex-1 overflow-y-auto"
          role="log"
          // Deliberately not a live region. At "fast" rate this gains several
          // lines a second; announcing each one would make the console
          // unusable with a screen reader. Escalations are announced instead
          // by the dedicated region below, throttled to one at a time.
          aria-live="off"
          aria-label="Operational activity"
        >
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const event = events[item.index]
              if (!event) {
                return null
              }
              const token = SEVERITY_TOKENS[event.severity]
              const interactive = Boolean(event.vehicleId ?? event.deliveryId)

              return (
                <div
                  key={event.id}
                  className="absolute inset-x-0 px-2"
                  style={{
                    height: `${item.size}px`,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <button
                    type="button"
                    disabled={!interactive}
                    onClick={() => onSelect(event)}
                    className={cn(
                      "flex h-full w-full items-center gap-2 border-b border-border/50 text-left text-[11px]",
                      interactive
                        ? "cursor-pointer hover:bg-accent"
                        : "cursor-default",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                    )}
                  >
                    <span className="ops-figure w-16 shrink-0 text-muted-foreground">
                      {formatTimestamp(event.at)}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        token.dotClassName
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {event.message}
                    </span>
                    {event.severity !== "INFO" ? (
                      <span
                        className={cn(
                          "shrink-0 text-[9px] font-semibold",
                          event.severity === "CRITICAL"
                            ? "text-red-600 dark:text-red-400"
                            : "text-orange-600 dark:text-orange-400"
                        )}
                      >
                        {token.code}
                      </span>
                    ) : null}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function SeverityChip({
  label,
  title,
  active,
  dotClassName,
  onClick,
}: {
  readonly label: string
  readonly title?: string
  readonly active: boolean
  readonly dotClassName?: string
  onClick(): void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title ?? label}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1 py-px text-[10px] transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent"
      )}
    >
      {dotClassName ? (
        <span
          aria-hidden="true"
          className={cn("size-1.5 rounded-full", dotClassName)}
        />
      ) : null}
      {label}
    </button>
  )
}

/** Minimum gap between spoken escalations, in milliseconds. */
const ANNOUNCE_INTERVAL_MS = 8_000

/**
 * Announces at most one critical event every few seconds.
 *
 * A screen reader cannot keep up with the raw feed, and interrupting on every
 * line means the user hears fragments of everything and the content of
 * nothing. Throttling to escalations keeps the channel useful.
 */
function useCriticalAnnouncement(events: readonly ActivityEvent[]): string {
  const [announcement, setAnnouncement] = useState("")
  const lastAnnouncedAt = useRef(0)
  const lastId = useRef<string | null>(null)

  useEffect(() => {
    const critical = events.find((event) => event.severity === "CRITICAL")
    if (!critical || critical.id === lastId.current) {
      return
    }

    const now = Date.now()
    if (now - lastAnnouncedAt.current < ANNOUNCE_INTERVAL_MS) {
      return
    }

    lastId.current = critical.id
    lastAnnouncedAt.current = now
    setAnnouncement(`Critical: ${critical.message}`)
  }, [events])

  return announcement
}
