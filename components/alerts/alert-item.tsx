"use client"

import { CheckIcon, EyeIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatRelative } from "@/lib/formatting"
import { SEVERITY_TOKENS } from "@/lib/status-tokens"
import type { Alert } from "@/types"

interface AlertItemProps {
  readonly alert: Alert
  readonly now: number
  onAcknowledge(alertId: string): void
  onDismiss(alertId: string): void
  onResolve(alertId: string): void
  onInspect(alert: Alert): void
}

const BORDER_BY_SEVERITY = {
  CRITICAL: "border-l-red-500",
  WARNING: "border-l-orange-500",
  INFO: "border-l-sky-500",
} as const

/**
 * One alert row. The severity stripe makes the queue scannable at the edge of
 * vision, and acknowledged alerts fade rather than disappear so an operator can
 * still see what they have already dealt with this shift.
 */
export function AlertItem({
  alert,
  now,
  onAcknowledge,
  onDismiss,
  onResolve,
  onInspect,
}: AlertItemProps) {
  const token = SEVERITY_TOKENS[alert.severity]
  const settled = alert.status === "RESOLVED" || alert.status === "DISMISSED"

  return (
    <article
      className={cn(
        "border-b border-l-2 border-border px-2.5 py-2",
        BORDER_BY_SEVERITY[alert.severity],
        settled && "opacity-55",
        alert.status === "ACKNOWLEDGED" && "opacity-80"
      )}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className={cn("mt-1 size-2 shrink-0 rounded-full", token.dotClassName)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-xs font-medium">{alert.title}</h3>
            <span className="ops-figure shrink-0 text-[10px] text-muted-foreground">
              {formatRelative(alert.createdAt, now)}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] break-words text-muted-foreground">
            {alert.message}
          </p>
          <div className="mt-1.5 flex items-center gap-1">
            <span
              className={cn(
                "rounded border px-1 py-px text-[9px] font-semibold",
                token.className
              )}
            >
              {token.code}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {alert.status.toLowerCase()}
            </span>

            <div className="ml-auto flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onInspect(alert)}
                aria-label={`Inspect ${alert.title}`}
                title="Inspect"
              >
                <EyeIcon aria-hidden="true" />
              </Button>
              {alert.status === "OPEN" ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => onAcknowledge(alert.id)}
                  aria-label={`Acknowledge ${alert.title}`}
                >
                  Ack
                </Button>
              ) : null}
              {!settled ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onResolve(alert.id)}
                    aria-label={`Resolve ${alert.title}`}
                    title="Resolve"
                  >
                    <CheckIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onDismiss(alert.id)}
                    aria-label={`Dismiss ${alert.title}`}
                    title="Dismiss"
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
