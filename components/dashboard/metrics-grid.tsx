"use client"

import { cn } from "@/lib/utils"
import type { KpiDefinition } from "@/hooks"
import type { DeliveryStatusFilter } from "@/types"
import { KpiCard } from "./kpi-card"

interface MetricsGridProps {
  readonly kpis: readonly KpiDefinition[]
  readonly activeStatus: DeliveryStatusFilter
  readonly columns?: 1 | 2 | 4
  onDrilldown(status: DeliveryStatusFilter): void
}

/**
 * Presentational KPI grid. It is handed finished values and a single callback —
 * it does not know what a delivery is, let alone how a delay is computed.
 */
export function MetricsGrid({
  kpis,
  activeStatus,
  columns = 2,
  onDrilldown,
}: MetricsGridProps) {
  return (
    <div
      className={cn(
        "grid gap-1.5",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-2",
        columns === 4 && "grid-cols-2 xl:grid-cols-4"
      )}
    >
      {kpis.map((kpi) => (
        <KpiCard
          key={kpi.id}
          kpi={kpi}
          active={Boolean(kpi.drilldown) && kpi.drilldown === activeStatus}
          onSelect={(selected) => {
            const next = selected.drilldown as DeliveryStatusFilter | undefined
            if (!next) {
              return
            }
            onDrilldown(activeStatus === next ? "ALL" : next)
          }}
        />
      ))}
    </div>
  )
}
