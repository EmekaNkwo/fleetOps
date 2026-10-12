"use client"

import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AlertPanel } from "@/components/alerts/alert-panel"
import { FuelPanel } from "@/components/fleet/fuel-panel"
import { GeofencePanel } from "@/components/geofence/geofence-panel"
import { IncidentPanel } from "@/components/incidents/incident-panel"
import { SettingsPanel } from "@/components/settings/settings-panel"
import { SimulationPanel } from "@/components/simulation/simulation-panel"
import { useAlerts, useIncidents, useIsCompact, useSimulation } from "@/hooks"
import type { SidePanel as SidePanelKind } from "@/types"
import { ShortcutsPanel } from "./shortcuts-panel"

export interface SidePanelProps {
  readonly panel: SidePanelKind
  onClose(): void
}

const TITLES: Readonly<Record<Exclude<SidePanelKind, null>, string>> = {
  alerts: "Alert centre",
  incidents: "Incident management",
  fuel: "Refuelling worklist",
  zones: "Geofence zones",
  settings: "Alerting and escalation",
  simulation: "Simulation control",
  shortcuts: "Keyboard shortcuts",
}

/**
 * Right-hand drawer hosting the secondary workspaces. One drawer with a
 * switched body rather than four independent overlays: only one of these is
 * ever useful at a time, and sharing the frame keeps the chrome consistent.
 */
export function SidePanel({ panel, onClose }: SidePanelProps) {
  const compact = useIsCompact()

  if (!panel) {
    return null
  }

  return (
    <aside
      role="region"
      aria-label={TITLES[panel]}
      className={cn(
        "z-30 flex shrink-0 flex-col border-border bg-card",
        "animate-in duration-150 motion-reduce:animate-none",
        compact
          ? "fixed inset-0 slide-in-from-bottom-4"
          : "w-[21rem] border-l slide-in-from-right-4"
      )}
    >
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2.5">
        <h2 className="ops-label">{TITLES[panel]}</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={`Close ${TITLES[panel]}`}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </header>

      <div className="min-h-0 flex-1">
        {/* Each panel subscribes to its own domain, and only while mounted. */}
        {panel === "alerts" ? <AlertPanelContainer /> : null}
        {panel === "incidents" ? <IncidentPanelContainer /> : null}
        {panel === "fuel" ? <FuelPanel /> : null}
        {panel === "zones" ? <GeofencePanel /> : null}
        {panel === "settings" ? <SettingsPanel /> : null}
        {panel === "simulation" ? <SimulationPanelContainer /> : null}
        {panel === "shortcuts" ? <ShortcutsPanel /> : null}
      </div>
    </aside>
  )
}

function AlertPanelContainer() {
  return <AlertPanel alerts={useAlerts()} />
}

function IncidentPanelContainer() {
  return <IncidentPanel incidents={useIncidents()} />
}

function SimulationPanelContainer() {
  return <SimulationPanel simulation={useSimulation()} />
}
