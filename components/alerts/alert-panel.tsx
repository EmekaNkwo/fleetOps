"use client"

import {
  BellOffIcon,
  CheckCheckIcon,
  MonitorIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared/empty-state"
import { SEVERITY_ORDER, SEVERITY_TOKENS } from "@/lib/status-tokens"
import { useAlertNotifications, useNow } from "@/hooks"
import type { UseAlertsResult } from "@/hooks"
import { AlertItem } from "./alert-item"

interface AlertPanelProps {
  readonly alerts: UseAlertsResult
}

/**
 * Alert centre. Severity tabs double as counters, which is usually the first
 * question an operator has: how many criticals are open right now?
 */
export function AlertPanel({ alerts }: AlertPanelProps) {
  const now = useNow(5_000)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <NotificationControls />
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border p-2">
        <div role="group" aria-label="Filter alerts by severity" className="flex gap-1">
          <SeverityTab
            label="All"
            count={
              alerts.countsBySeverity.CRITICAL +
              alerts.countsBySeverity.WARNING +
              alerts.countsBySeverity.INFO
            }
            active={alerts.severityFilter === "ALL"}
            onClick={() => alerts.setSeverityFilter("ALL")}
          />
          {SEVERITY_ORDER.map((severity) => (
            <SeverityTab
              key={severity}
              label={SEVERITY_TOKENS[severity].label}
              count={alerts.countsBySeverity[severity]}
              dotClassName={SEVERITY_TOKENS[severity].dotClassName}
              active={alerts.severityFilter === severity}
              onClick={() =>
                alerts.setSeverityFilter(
                  alerts.severityFilter === severity ? "ALL" : severity
                )
              }
            />
          ))}
        </div>

        {alerts.openCount > 0 ? (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto"
            onClick={alerts.acknowledgeAll}
          >
            <CheckCheckIcon aria-hidden="true" />
            Ack all
          </Button>
        ) : null}
      </div>

      <div className="ops-scroll min-h-0 flex-1 overflow-y-auto">
        {alerts.visibleAlerts.length === 0 ? (
          <EmptyState
            icon={BellOffIcon}
            title={
              alerts.severityFilter === "ALL"
                ? "No active alerts"
                : "Nothing at this severity"
            }
            description={
              alerts.severityFilter === "ALL"
                ? "The operation is running clean. New alerts appear here the moment a delivery slips or a vehicle drops off the network."
                : "Switch to another severity to see the rest of the queue."
            }
            tone={alerts.severityFilter === "ALL" ? "positive" : "neutral"}
          />
        ) : (
          alerts.visibleAlerts.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              now={now}
              onAcknowledge={alerts.acknowledge}
              onDismiss={alerts.dismiss}
              onResolve={alerts.resolve}
              onInspect={alerts.inspect}
            />
          ))
        )}
      </div>
    </div>
  )
}

function SeverityTab({
  label,
  count,
  dotClassName,
  active,
  onClick,
}: {
  readonly label: string
  readonly count: number
  readonly dotClassName?: string
  readonly active: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {dotClassName ? (
        <span
          aria-hidden="true"
          className={cn("size-1.5 rounded-full", dotClassName)}
        />
      ) : null}
      {label}
      <span className="ops-figure opacity-70">{count}</span>
    </button>
  )
}

/**
 * Opt-in escalation channels.
 *
 * Both default to off. A console that makes noise the moment it loads, or that
 * asks for notification permission before the operator has expressed any
 * interest, trains people to refuse both — so the permission prompt is only
 * raised when the switch is actually turned on.
 */
function NotificationControls() {
  const notifications = useAlertNotifications()

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-2 py-1.5">
      <span className="ops-label">Escalations</span>

      <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
        <input
          type="checkbox"
          checked={notifications.preferences.sound}
          disabled={!notifications.soundSupported}
          onChange={(event) => notifications.setSound(event.target.checked)}
          className="size-3 accent-primary"
        />
        {notifications.preferences.sound ? (
          <Volume2Icon className="size-3.5" aria-hidden="true" />
        ) : (
          <VolumeXIcon className="size-3.5" aria-hidden="true" />
        )}
        Sound
      </label>

      <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
        <input
          type="checkbox"
          checked={notifications.preferences.desktop}
          disabled={
            notifications.desktopPermission === "unsupported" ||
            notifications.desktopBlocked
          }
          onChange={(event) => {
            void notifications.enableDesktop(event.target.checked)
          }}
          className="size-3 accent-primary"
        />
        <MonitorIcon className="size-3.5" aria-hidden="true" />
        Desktop
      </label>

      {notifications.preferences.sound ? (
        <Button
          variant="ghost"
          size="xs"
          onClick={notifications.preview}
          className="ml-auto"
        >
          Test
        </Button>
      ) : null}

      {notifications.desktopBlocked ? (
        <p className="w-full text-[10px] text-muted-foreground">
          Desktop notifications are blocked for this site in your browser
          settings.
        </p>
      ) : (
        <p className="w-full text-[10px] text-muted-foreground">
          Critical alerts only. Desktop notifications appear when the console is
          in a background tab.
        </p>
      )}
    </div>
  )
}
