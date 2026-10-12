"use client"

import { RotateCcwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { useAlertSettings } from "@/hooks/use-alert-settings"
import { useAlertNotifications } from "@/hooks"

/**
 * Operator settings: what counts as a problem, and how loudly to say so.
 *
 * Thresholds sit next to the escalation channels deliberately — they are two
 * halves of the same decision. Tightening "delayed" without noticing that
 * desktop notifications are on is how an operator ends up buried in alerts.
 */
export function SettingsPanel() {
  const settings = useAlertSettings()
  const notifications = useAlertNotifications()

  return (
    <div className="ops-scroll h-full overflow-y-auto">
      <section aria-label="Alert thresholds" className="border-b border-border p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="ops-label">Thresholds</h3>
          <Button
            variant="ghost"
            size="xs"
            onClick={settings.reset}
            disabled={settings.isDefault}
          >
            <RotateCcwIcon aria-hidden="true" />
            Defaults
          </Button>
        </div>

        <p className="mb-3 text-[11px] text-muted-foreground">
          These decide what the whole console calls late, at risk and low.
          Changes apply as the simulation re-evaluates each record — the board is
          not restated retroactively.
        </p>

        <div className="space-y-3.5">
          {settings.controls.map((control) => (
            <div key={control.key}>
              <div className="flex items-baseline justify-between gap-2">
                <label
                  htmlFor={`threshold-${control.key}`}
                  className="text-[11px] font-medium"
                >
                  {control.label}
                </label>
                <span
                  className={cn(
                    "ops-figure text-xs font-semibold",
                    !control.isDefault && "text-primary"
                  )}
                >
                  {control.value}
                  {control.unit}
                </span>
              </div>

              <input
                id={`threshold-${control.key}`}
                type="range"
                min={control.min}
                max={control.max}
                step={1}
                value={control.value}
                onChange={(event) =>
                  settings.set(control.key, Number(event.target.value))
                }
                aria-describedby={`threshold-hint-${control.key}`}
                className="mt-1 w-full accent-primary"
              />

              <p
                id={`threshold-hint-${control.key}`}
                className="mt-0.5 text-[10px] text-muted-foreground"
              >
                {control.hint}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Escalation channels" className="p-2.5">
        <h3 className="ops-label mb-2">Escalation</h3>
        <p className="mb-2.5 text-[11px] text-muted-foreground">
          Critical alerts only. Both channels are off until you ask for them.
        </p>

        <div className="space-y-2.5">
          <label className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[11px] font-medium">Audible tone</span>
              <span className="block text-[10px] text-muted-foreground">
                Plays a short tone when a critical alert is raised.
              </span>
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                size="xs"
                onClick={notifications.preview}
                disabled={!notifications.soundSupported}
              >
                Preview
              </Button>
              <Switch
                checked={notifications.preferences.sound}
                onCheckedChange={notifications.setSound}
                disabled={!notifications.soundSupported}
                aria-label="Play a tone on critical alerts"
              />
            </div>
          </label>

          <label className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[11px] font-medium">
                Desktop notifications
              </span>
              <span className="block text-[10px] text-muted-foreground">
                {notifications.desktopBlocked
                  ? "Blocked by the browser. Allow notifications for this site to use this."
                  : "Raised only while the console is in a background tab."}
              </span>
            </span>
            <Switch
              checked={notifications.preferences.desktop}
              onCheckedChange={(enabled) => {
                void notifications.enableDesktop(enabled)
              }}
              disabled={notifications.desktopBlocked}
              aria-label="Raise desktop notifications on critical alerts"
            />
          </label>
        </div>
      </section>
    </div>
  )
}
