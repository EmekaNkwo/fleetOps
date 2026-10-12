"use client"

import { FuelIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared/empty-state"
import { Meter } from "@/components/shared/meter"
import { formatDistance, formatNumber } from "@/lib/formatting"
import { useFuel, type FuelRow } from "@/hooks/use-fuel"

const RISK_TONE = {
  critical: "bad",
  low: "warn",
  watch: "good",
} as const

/**
 * The refuelling worklist.
 *
 * Ordered by consequence rather than by tank level: a vehicle at 12% finishing
 * a short hop into Ikeja is fine, and one at 25% with 400 km left is not. The
 * list leads with the ones that will strand.
 */
export function FuelPanel() {
  const fuel = useFuel()

  if (fuel.rows.length === 0) {
    return (
      <EmptyState
        icon={FuelIcon}
        title="Every tank is healthy"
        description={`No vehicle is within range of the ${fuel.threshold}% refuelling line. This list fills as the fleet burns through the shift.`}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-2.5 py-2">
        <p className="text-[11px] text-muted-foreground">
          {fuel.strandedCount > 0 ? (
            <>
              <span className="font-medium text-red-500">
                {formatNumber(fuel.strandedCount)}
              </span>{" "}
              {fuel.strandedCount === 1 ? "vehicle" : "vehicles"} will not reach
              the end of the current run.
            </>
          ) : (
            "Every listed vehicle has the range to finish its current run."
          )}
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Alerting below {fuel.threshold}% · tracked from twice that.
        </p>
      </div>

      <ul className="ops-scroll min-h-0 flex-1 overflow-y-auto">
        {fuel.rows.map((row) => (
          <FuelRowItem key={row.vehicle.id} row={row} onSelect={fuel.select} />
        ))}
      </ul>
    </div>
  )
}

function FuelRowItem({
  row,
  onSelect,
}: {
  readonly row: FuelRow
  onSelect(vehicleId: string): void
}) {
  const stranding = row.completesRun === false

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(row.vehicle.id)}
        className="w-full border-b border-border/60 px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      >
        <div className="flex items-baseline gap-2">
          <span className="ops-figure text-xs font-semibold">
            {row.vehicle.callSign}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {row.driverName} · {row.routeName ?? "Not on a route"}
          </span>
          <span
            className={cn(
              "ops-figure shrink-0 text-xs font-medium",
              row.risk === "critical" && "text-red-500",
              row.risk === "low" && "text-orange-500"
            )}
          >
            {Math.round(row.vehicle.fuelLevel)}%
          </span>
        </div>

        <div className="mt-1.5">
          <Meter
            label="Tank"
            fraction={row.vehicle.fuelLevel / 100}
            display={`~${formatDistance(row.rangeKm)} range`}
            tone={RISK_TONE[row.risk]}
            segments={14}
          />
        </div>

        {row.completesRun === null ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Idle — refuel before the next dispatch.
          </p>
        ) : (
          <p
            className={cn(
              "mt-1 text-[10px]",
              stranding ? "font-medium text-red-500" : "text-muted-foreground"
            )}
          >
            {stranding
              ? `Short by ${formatDistance(row.remainingKm - row.rangeKm)} for the remaining ${formatDistance(row.remainingKm)}.`
              : `Covers the remaining ${formatDistance(row.remainingKm)}.`}
          </p>
        )}
      </button>
    </li>
  )
}
