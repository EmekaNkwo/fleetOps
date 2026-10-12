"use client"

import {
  BarChart3Icon,
  MapIcon,
  RouteIcon,
  TableIcon,
  UsersIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { OperationsMap } from "@/components/map/operations-map"
import { DeliveryStatusFilterGroup } from "@/components/dashboard/filter-controls"
import { useDeliveries, useOperationsWorkspace } from "@/hooks"
import {
  LazyAnalyticsView,
  LazyDeliveryBoard,
  LazyDriverRoster,
  LazyRouteBoard,
} from "./lazy"
import type { WorkspaceTab } from "@/types"

interface WorkspaceProps {
  /** Changes whenever a panel opens or closes, so the map can re-measure. */
  readonly layoutKey: string
}

const TABS: readonly {
  id: WorkspaceTab
  label: string
  icon: typeof MapIcon
  shortcut: string
}[] = [
  { id: "map", label: "Live map", icon: MapIcon, shortcut: "M" },
  { id: "deliveries", label: "Deliveries", icon: TableIcon, shortcut: "D" },
  { id: "drivers", label: "Roster", icon: UsersIcon, shortcut: "W" },
  { id: "routes", label: "Corridors", icon: RouteIcon, shortcut: "C" },
  { id: "analytics", label: "Analytics", icon: BarChart3Icon, shortcut: "G" },
]

/**
 * Main work area.
 *
 * The map stays mounted and is hidden with CSS — tearing down the Mapbox
 * instance on every tab switch would reload the basemap and lose the camera.
 * The board and the analytics view are mounted only while visible: both are
 * cheap to recreate and expensive to keep alive, because each subscribes to
 * store state that changes several times a second.
 */
export function Workspace({ layoutKey }: WorkspaceProps) {
  const workspace = useOperationsWorkspace()
  const { statusFilter, setStatusFilter } = useDeliveries()

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="ops-chrome flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        <div role="tablist" aria-label="Workspace" className="flex gap-1">
          {TABS.map((tab) => {
            const active = workspace.tab === tab.id
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`workspace-tab-${tab.id}`}
                aria-selected={active}
                aria-controls={`workspace-panel-${tab.id}`}
                onClick={() => workspace.setTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active
                    ? "border-border bg-card text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {tab.label}
                <kbd className="ml-0.5 hidden rounded border border-border bg-muted px-1 text-[9px] text-muted-foreground lg:inline">
                  {tab.shortcut}
                </kbd>
              </button>
            )
          })}
        </div>

        {workspace.tab === "deliveries" ? (
          <div className="ml-auto hidden md:block">
            <DeliveryStatusFilterGroup
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          role="tabpanel"
          id="workspace-panel-map"
          aria-labelledby="workspace-tab-map"
          hidden={workspace.tab !== "map"}
          className="absolute inset-0"
        >
          <OperationsMap layoutKey={layoutKey} />
        </div>

        {workspace.tab === "deliveries" ? (
          <div
            role="tabpanel"
            id="workspace-panel-deliveries"
            aria-labelledby="workspace-tab-deliveries"
            className="absolute inset-0"
          >
            <LazyDeliveryBoard />
          </div>
        ) : null}

        {workspace.tab === "drivers" ? (
          <div
            role="tabpanel"
            id="workspace-panel-drivers"
            aria-labelledby="workspace-tab-drivers"
            className="absolute inset-0"
          >
            <LazyDriverRoster />
          </div>
        ) : null}

        {workspace.tab === "routes" ? (
          <div
            role="tabpanel"
            id="workspace-panel-routes"
            aria-labelledby="workspace-tab-routes"
            className="absolute inset-0"
          >
            <LazyRouteBoard />
          </div>
        ) : null}

        {workspace.tab === "analytics" ? (
          <div
            role="tabpanel"
            id="workspace-panel-analytics"
            aria-labelledby="workspace-tab-analytics"
            className="absolute inset-0"
          >
            <LazyAnalyticsView />
          </div>
        ) : null}
      </div>
    </div>
  )
}
