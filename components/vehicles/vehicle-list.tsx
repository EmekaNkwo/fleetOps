"use client"

import { ChevronLeftIcon, ChevronRightIcon, TruckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatNumber, formatSpeed } from "@/lib/formatting"
import { VEHICLE_STATUS_TOKENS } from "@/lib/status-tokens"
import { EmptyState } from "@/components/shared/empty-state"
import { StatusDot } from "@/components/shared/status-badge"
import type { Vehicle } from "@/types"

interface VehicleListProps {
  /** The current page only. */
  readonly vehicles: readonly Vehicle[]
  readonly selectedVehicleId: string | null
  readonly emptyHint: string
  readonly page: number
  readonly pageCount: number
  readonly pageSize: number
  readonly pageSizes: readonly number[]
  readonly rangeStart: number
  readonly rangeEnd: number
  readonly totalCount: number
  onSelect(vehicleId: string): void
  onPage(page: number): void
  onPageSize(size: number): void
}

/**
 * Paginated fleet rail.
 *
 * A page is rendered in full rather than virtualised: with at most fifty rows
 * on screen the DOM cost is negligible, and pagination already bounds it —
 * virtualising a bounded list adds a measurement dependency and an empty first
 * frame in exchange for nothing. The activity feed, which is unbounded and
 * append-heavy, stays virtualised.
 */
export function VehicleList({
  vehicles,
  selectedVehicleId,
  emptyHint,
  page,
  pageCount,
  pageSize,
  pageSizes,
  rangeStart,
  rangeEnd,
  totalCount,
  onSelect,
  onPage,
  onPageSize,
}: VehicleListProps) {
  if (totalCount === 0) {
    return (
      <EmptyState
        icon={TruckIcon}
        title="No vehicles match"
        description={emptyHint}
        compact
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="ops-scroll min-h-0 flex-1 overflow-y-auto"
        role="listbox"
        aria-label="Fleet"
        aria-activedescendant={
          selectedVehicleId ? `vehicle-option-${selectedVehicleId}` : undefined
        }
      >
        {vehicles.map((vehicle) => {
          const token = VEHICLE_STATUS_TOKENS[vehicle.status]
          const selected = vehicle.id === selectedVehicleId

          return (
            <div
              key={vehicle.id}
              id={`vehicle-option-${vehicle.id}`}
              role="option"
              aria-selected={selected}
              tabIndex={0}
              onClick={() => onSelect(vehicle.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onSelect(vehicle.id)
                }
              }}
              className={cn(
                "flex h-[38px] cursor-pointer items-center gap-2 border-b border-border/60 px-3 text-xs",
                "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                selected && "bg-accent"
              )}
            >
              <StatusDot token={token} />
              <span className="ops-figure w-9 shrink-0 font-medium">
                {vehicle.callSign}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {vehicle.type}
              </span>
              <span className="ops-figure w-16 shrink-0 text-right text-muted-foreground">
                {vehicle.status === "OFFLINE" ? "—" : formatSpeed(vehicle.speed)}
              </span>
              <span className="w-8 shrink-0 text-right text-[10px] font-medium text-muted-foreground">
                {token.code}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1.5 border-t border-border px-2">
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="sr-only">Vehicles per page</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            aria-label="Vehicles per page"
            className="rounded border border-border bg-card px-1 py-0.5 text-[10px] text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          / page
        </label>

        <span className="ops-figure ml-auto text-[10px] text-muted-foreground">
          {formatNumber(rangeStart)}–{formatNumber(rangeEnd)} of{" "}
          {formatNumber(totalCount)}
        </span>

        <Button
          variant="outline"
          size="icon-xs"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page of vehicles"
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon-xs"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          aria-label="Next page of vehicles"
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
