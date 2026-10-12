"use client"

import { MapPinPlusIcon, ShapesIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared/empty-state"
import { useGeofences } from "@/hooks/use-geofences"
import type { Geofence, GeofenceTrigger } from "@/types"

const TRIGGERS: readonly { id: GeofenceTrigger; label: string }[] = [
  { id: "enter", label: "Enter" },
  { id: "exit", label: "Exit" },
  { id: "dwell", label: "Dwell" },
]

/**
 * Zone management.
 *
 * Placing a zone arms the map rather than opening a coordinate form — the
 * operator points at the depot, the junction or the trouble spot they mean.
 * Everything else about the zone is tuned here afterwards.
 */
export function GeofencePanel() {
  const geofences = useGeofences()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-1.5 border-b border-border p-2">
        <Button
          variant={geofences.placing ? "default" : "outline"}
          size="xs"
          className="w-full"
          disabled={geofences.atLimit && !geofences.placing}
          onClick={() =>
            geofences.placing ? geofences.cancelPlacing() : geofences.beginPlacing()
          }
        >
          <MapPinPlusIcon aria-hidden="true" />
          {geofences.placing ? "Click the map to place · cancel" : "Add a zone"}
        </Button>

        <p className="text-[10px] text-muted-foreground" role="status">
          {geofences.placing
            ? "The map is armed. Click where the zone should be centred."
            : geofences.atLimit
              ? `At the ${geofences.limits.maxZones}-zone limit. Delete one to add another.`
              : `${geofences.zones.length} of ${geofences.limits.maxZones} zones. Breaches appear in the alert queue.`}
        </p>
      </div>

      <div className="ops-scroll min-h-0 flex-1 overflow-y-auto">
        {geofences.zones.length === 0 ? (
          <EmptyState
            icon={ShapesIcon}
            title="No zones defined"
            description="Draw a zone around a depot, a customer site or a trouble spot and the console will alert when vehicles cross it."
          />
        ) : (
          <ul>
            {geofences.zones.map((zone) => (
              <ZoneRow
                key={zone.id}
                zone={zone}
                limits={geofences.limits}
                onUpdate={geofences.update}
                onToggle={geofences.toggle}
                onRemove={geofences.remove}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ZoneRow({
  zone,
  limits,
  onUpdate,
  onToggle,
  onRemove,
}: {
  readonly zone: Geofence
  readonly limits: ReturnType<typeof useGeofences>["limits"]
  onUpdate(id: string, changes: { name?: string; radiusKm?: number; triggers?: readonly GeofenceTrigger[]; dwellMinutes?: number }): void
  onToggle(id: string): void
  onRemove(id: string): void
}) {
  const dwellActive = zone.triggers.includes("dwell")

  return (
    <li
      className={cn(
        "space-y-2 border-b border-border/60 p-2.5",
        !zone.enabled && "opacity-55"
      )}
    >
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={zone.name}
          maxLength={limits.maxNameLength}
          onChange={(event) => onUpdate(zone.id, { name: event.target.value })}
          aria-label={`Name of zone ${zone.name}`}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium hover:border-border focus-visible:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        <Switch
          checked={zone.enabled}
          onCheckedChange={() => onToggle(zone.id)}
          aria-label={`Zone ${zone.name} active`}
        />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onRemove(zone.id)}
          aria-label={`Delete zone ${zone.name}`}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label
            htmlFor={`radius-${zone.id}`}
            className="ops-label"
          >
            Radius
          </label>
          <span className="ops-figure text-[11px] font-medium">
            {zone.radiusKm} km
          </span>
        </div>
        <input
          id={`radius-${zone.id}`}
          type="range"
          min={limits.radius.min}
          max={limits.radius.max}
          value={zone.radiusKm}
          onChange={(event) =>
            onUpdate(zone.id, { radiusKm: Number(event.target.value) })
          }
          className="w-full accent-primary"
        />
      </div>

      <div
        role="group"
        aria-label={`Triggers for ${zone.name}`}
        className="flex gap-1"
      >
        {TRIGGERS.map((trigger) => {
          const active = zone.triggers.includes(trigger.id)
          return (
            <button
              key={trigger.id}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onUpdate(zone.id, {
                  triggers: active
                    ? zone.triggers.filter((entry) => entry !== trigger.id)
                    : [...zone.triggers, trigger.id],
                })
              }
              className={cn(
                "flex-1 rounded border px-1.5 py-1 text-[10px] font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active
                  ? "border-border bg-accent text-foreground"
                  : "border-border/60 text-muted-foreground hover:bg-accent"
              )}
            >
              {trigger.label}
            </button>
          )
        })}
      </div>

      {dwellActive ? (
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor={`dwell-${zone.id}`} className="ops-label">
              Dwell alert after
            </label>
            <span className="ops-figure text-[11px] font-medium">
              {zone.dwellMinutes} min
            </span>
          </div>
          <input
            id={`dwell-${zone.id}`}
            type="range"
            min={limits.dwell.min}
            max={limits.dwell.max}
            value={zone.dwellMinutes}
            onChange={(event) =>
              onUpdate(zone.id, { dwellMinutes: Number(event.target.value) })
            }
            className="w-full accent-primary"
          />
          <p className="text-[10px] text-muted-foreground">
            Measured in simulated time, and fired once per visit.
          </p>
        </div>
      ) : null}
    </li>
  )
}
