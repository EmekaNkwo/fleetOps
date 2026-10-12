"use client"

import {
  BellIcon,
  MenuIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SearchIcon,
  SunIcon,
  TriangleAlertIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useSimulation } from "@/hooks"
import { LiveIndicator } from "./live-indicator"

interface OperationsHeaderProps {
  readonly openAlerts: number
  readonly criticalAlerts: number
  readonly openIncidents: number
  readonly compact: boolean
  /** Slot for surfaces that own their own state, e.g. the export menu. */
  readonly actions?: ReactNode
  onOpenSearch(): void
  onOpenAlerts(): void
  onOpenIncidents(): void
  onToggleSidebar(): void
}

/**
 * Top chrome. Purely presentational: every number and callback arrives as a
 * prop, so the header can be dropped into a different shell unchanged.
 */
export function OperationsHeader({
  openAlerts,
  criticalAlerts,
  openIncidents,
  compact,
  actions,
  onOpenSearch,
  onOpenAlerts,
  onOpenIncidents,
  onToggleSidebar,
}: OperationsHeaderProps) {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <header className="ops-chrome flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 md:px-3">
      {compact ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleSidebar}
          aria-label="Open overview drawer"
        >
          <MenuIcon aria-hidden="true" />
        </Button>
      ) : null}

      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="grid size-7 place-items-center rounded bg-primary text-[11px] font-bold tracking-tight text-primary-foreground"
        >
          FO
        </span>
        <div className="leading-none">
          <p className="text-sm font-semibold tracking-tight">FleetOps</p>
          <p className="hidden text-[10px] text-muted-foreground sm:block">
            Operations Control Center
          </p>
        </div>
      </div>

      <div className="mx-2 hidden h-6 w-px bg-border lg:block" />

      <LiveIndicator />

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSearch}
          className="hidden md:inline-flex"
        >
          <SearchIcon aria-hidden="true" />
          Search
          <kbd className="ml-1 rounded border border-border bg-muted px-1 text-[10px] text-muted-foreground">
            /
          </kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenSearch}
          aria-label="Search"
          className="md:hidden"
        >
          <SearchIcon aria-hidden="true" />
        </Button>

        <SimulationControls />

        <div className="mx-1 h-6 w-px bg-border" />

        <IndicatorButton
          icon={<BellIcon aria-hidden="true" />}
          count={openAlerts}
          tone={criticalAlerts > 0 ? "critical" : "warning"}
          label={`Open alerts: ${openAlerts}`}
          onClick={onOpenAlerts}
        />
        <IndicatorButton
          icon={<TriangleAlertIcon aria-hidden="true" />}
          count={openIncidents}
          tone="warning"
          label={`Open incidents: ${openIncidents}`}
          onClick={onOpenIncidents}
        />

        {actions}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          aria-label="Toggle dark mode"
        >
          {resolvedTheme === "dark" ? (
            <SunIcon aria-hidden="true" />
          ) : (
            <MoonIcon aria-hidden="true" />
          )}
        </Button>

        <div className="ml-1 hidden items-center gap-2 border-l border-border pl-2 lg:flex">
          <span
            aria-hidden="true"
            className="grid size-6 place-items-center rounded-full bg-secondary text-[10px] font-semibold"
          >
            TA
          </span>
          <div className="leading-tight">
            <p className="text-[11px] font-medium">Tolu Adewale</p>
            <p className="text-[10px] text-muted-foreground">Duty dispatcher</p>
          </div>
        </div>
      </div>
    </header>
  )
}

function IndicatorButton({
  icon,
  count,
  tone,
  label,
  onClick,
}: {
  readonly icon: React.ReactNode
  readonly count: number
  readonly tone: "warning" | "critical"
  readonly label: string
  onClick(): void
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      aria-label={label}
      className="relative"
    >
      {icon}
      {count > 0 ? (
        <span
          aria-hidden="true"
          className={cn(
            "ops-figure absolute -top-0.5 -right-0.5 grid min-w-3.5 place-items-center rounded-full px-0.5 text-[9px] leading-[14px] font-semibold text-white",
            tone === "critical" ? "bg-red-600" : "bg-orange-500"
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Button>
  )
}

/** Transport controls. Separated so the running flag does not re-render the bar. */
function SimulationControls() {
  const { running, toggle, reset } = useSimulation()

  return (
    <>
      <Button
        variant={running ? "outline" : "default"}
        size="sm"
        onClick={toggle}
        aria-label={running ? "Pause simulation" : "Start simulation"}
      >
        {running ? (
          <PauseIcon aria-hidden="true" />
        ) : (
          <PlayIcon aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{running ? "Pause" : "Start"}</span>
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={reset}
        aria-label="Reset simulation"
      >
        <RotateCcwIcon aria-hidden="true" />
      </Button>
    </>
  )
}
