"use client"

import { FilterXIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/formatting"
import {
  DELIVERY_STATUS_ORDER,
  DELIVERY_STATUS_TOKENS,
  VEHICLE_STATUS_ORDER,
  VEHICLE_STATUS_TOKENS,
} from "@/lib/status-tokens"
import type {
  DeliveryStatusFilter,
  Region,
  RegionId,
  VehicleStatus,
  VehicleStatusFilter,
} from "@/types"

interface FilterChipProps {
  readonly label: string
  readonly count?: number
  readonly active: boolean
  readonly dotClassName?: string
  onToggle(): void
}

function FilterChip({
  label,
  count,
  active,
  dotClassName,
  onToggle,
}: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
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
      <span className="truncate">{label}</span>
      {count === undefined ? null : (
        <span className="ops-figure tabular-nums opacity-70">
          {formatNumber(count)}
        </span>
      )}
    </button>
  )
}

interface VehicleStatusFilterGroupProps {
  readonly value: VehicleStatusFilter
  readonly countFor: (status: VehicleStatus) => number
  readonly total: number
  onChange(status: VehicleStatusFilter): void
}

export function VehicleStatusFilterGroup({
  value,
  countFor,
  total,
  onChange,
}: VehicleStatusFilterGroupProps) {
  return (
    <div
      className="flex flex-wrap gap-1"
      role="group"
      aria-label="Filter vehicles by status"
    >
      <FilterChip
        label="All"
        count={total}
        active={value === "ALL"}
        onToggle={() => onChange("ALL")}
      />
      {VEHICLE_STATUS_ORDER.filter((status) => status !== "DELIVERED").map(
        (status) => (
          <FilterChip
            key={status}
            label={VEHICLE_STATUS_TOKENS[status].label}
            count={countFor(status)}
            dotClassName={VEHICLE_STATUS_TOKENS[status].dotClassName}
            active={value === status}
            onToggle={() => onChange(value === status ? "ALL" : status)}
          />
        )
      )}
    </div>
  )
}

interface DeliveryStatusFilterGroupProps {
  readonly value: DeliveryStatusFilter
  onChange(status: DeliveryStatusFilter): void
}

export function DeliveryStatusFilterGroup({
  value,
  onChange,
}: DeliveryStatusFilterGroupProps) {
  return (
    <div
      className="flex flex-wrap gap-1"
      role="group"
      aria-label="Filter deliveries by status"
    >
      <FilterChip
        label="All"
        active={value === "ALL"}
        onToggle={() => onChange("ALL")}
      />
      {DELIVERY_STATUS_ORDER.map((status) => (
        <FilterChip
          key={status}
          label={DELIVERY_STATUS_TOKENS[status].label}
          dotClassName={DELIVERY_STATUS_TOKENS[status].dotClassName}
          active={value === status}
          onToggle={() => onChange(value === status ? "ALL" : status)}
        />
      ))}
    </div>
  )
}

interface RegionFilterGroupProps {
  readonly regions: readonly Region[]
  readonly selected: readonly RegionId[]
  onToggle(region: RegionId): void
}

export function RegionFilterGroup({
  regions,
  selected,
  onToggle,
}: RegionFilterGroupProps) {
  return (
    <div
      className="flex flex-wrap gap-1"
      role="group"
      aria-label="Filter by region"
    >
      {regions.map((region) => (
        <FilterChip
          key={region.id}
          label={region.name}
          active={selected.includes(region.id)}
          onToggle={() => onToggle(region.id)}
        />
      ))}
    </div>
  )
}

export function ClearFiltersButton({
  activeCount,
  onClear,
}: {
  readonly activeCount: number
  onClear(): void
}) {
  if (activeCount === 0) {
    return null
  }

  return (
    <Button variant="ghost" size="xs" onClick={onClear}>
      <FilterXIcon aria-hidden="true" />
      Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
    </Button>
  )
}
