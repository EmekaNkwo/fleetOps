"use client"

import { useState } from "react"
import { ActivityFeed } from "@/components/activity/activity-feed"
import {
  useActivity,
  useBootstrap,
  useCommands,
  useDeliveries,
  useDispatch,
  useDrivers,
  useFleet,
  useIsCompact,
  useKeyboardShortcuts,
  useMetrics,
  useOperationsWorkspace,
  useSimulation,
} from "@/hooks"
import {
  useAlertStore,
  useIncidentStore,
  useSimulationStore,
  useUiStore,
} from "@/stores"
import { BootstrapError, BootstrapLoading } from "./bootstrap-screen"
import { ErrorBoundary } from "./error-boundary"
import {
  LazyCommandPalette,
  LazyDeliveryDetails,
  LazyDriverDetails,
  LazyGlobalSearch,
  LazyHandoverReport,
  LazyOperationsBriefing,
  LazySidePanel,
  LazyVehicleDetails,
} from "./lazy"
import { ExportMenu } from "@/components/export/export-menu"
import { SavedViewsMenu } from "@/components/views/saved-views-menu"
import { ReplayBar } from "@/components/replay/replay-bar"
import { Toaster } from "@/components/shared/toaster"
import { OperationsHeader } from "./operations-header"
import { OperationsSidebar } from "./operations-sidebar"
import { Workspace } from "./workspace"

/**
 * The control centre.
 *
 * Layout and wiring only. It subscribes to the narrowest slices it needs —
 * bootstrap phase, the two badge counts, the current selection — and lets each
 * region below subscribe to its own domain.
 *
 * That split is what keeps a simulation tick from re-rendering the whole tree.
 * The header does not care that a truck moved; the map does not care that an
 * alert was acknowledged. Passing one `operations` object to everything made
 * every component care about everything, which re-rendered the entire console
 * roughly eight times a second.
 */
export function OperationsControlCenter() {
  const bootstrap = useBootstrap()
  const commands = useCommands()
  const compact = useIsCompact()
  const workspace = useOperationsWorkspace()
  useKeyboardShortcuts()

  const [drawerOpen, setDrawerOpen] = useState(false)

  const phase = useSimulationStore((state) => state.phase)
  const degraded = useSimulationStore((state) => state.processingErrors > 0)
  const openAlerts = useAlertStore((state) => state.openCount)
  const criticalAlerts = useAlertStore((state) => state.criticalCount)
  const openIncidents = useIncidentStore((state) => state.openCount)

  const commandPaletteOpen = useUiStore((state) => state.commandPaletteOpen)
  const setCommandPaletteOpen = useUiStore(
    (state) => state.setCommandPaletteOpen
  )
  const searchOpen = useUiStore((state) => state.searchOpen)
  const setSearchOpen = useUiStore((state) => state.setSearchOpen)
  const introVisible = useUiStore((state) => state.introVisible)
  const handoverVisible = useUiStore((state) => state.handoverVisible)
  const setHandoverVisible = useUiStore((state) => state.setHandoverVisible)
  const selection = useUiStore((state) => state.selection)

  if (bootstrap.isError) {
    return (
      <BootstrapError
        message={bootstrap.error?.message ?? "The gateway did not respond."}
        onRetry={bootstrap.retry}
      />
    )
  }

  if (!bootstrap.isReady || phase !== "ready") {
    return <BootstrapLoading progress={bootstrap.progress} />
  }

  // Re-measuring the map is driven off this key rather than a resize observer
  // race, so opening a panel never leaves the map with a stale viewport.
  const layoutKey = `${workspace.panel ?? "none"}:${selection?.kind ?? ""}:${selection?.id ?? ""}:${workspace.tab}`

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-primary focus:px-2 focus:py-1 focus:text-xs focus:text-primary-foreground"
      >
        Skip to workspace
      </a>

      <OperationsHeader
        openAlerts={openAlerts}
        criticalAlerts={criticalAlerts}
        openIncidents={openIncidents}
        compact={compact}
        actions={
          <>
            <SavedViewsMenu />
            <ExportMenu />
          </>
        }
        onOpenSearch={() => setSearchOpen(true)}
        onOpenAlerts={() => workspace.openPanel("alerts")}
        onOpenIncidents={() => workspace.openPanel("incidents")}
        onToggleSidebar={() => setDrawerOpen(true)}
      />

      {degraded ? (
        <p
          role="status"
          className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-700 dark:text-amber-300"
        >
          Some events failed to process. The console is still live but a few
          records may lag behind the simulation — open the simulation panel for
          details.
        </p>
      ) : null}

      <ReplayBar />

      <div className="flex min-h-0 flex-1">
        <ErrorBoundary scope="sidebar">
          <OperationsSidebar
            compact={compact}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />
        </ErrorBoundary>

        <main
          id="workspace"
          className="relative flex min-h-0 min-w-0 flex-1 flex-col"
        >
          {/* The workspace row. Detail panels and the side panel are flex
              siblings of the workspace, so nothing is ever hidden behind
              anything else and the live feed below stays visible. */}
          <div className="relative flex min-h-0 flex-1">
            {/* One boundary per region: a failure in the board must not take
                the map, the feed or the alert queue down with it. */}
            <ErrorBoundary scope="workspace">
              <Workspace layoutKey={layoutKey} />
            </ErrorBoundary>

            <ErrorBoundary scope="details">
              {selection?.kind === "vehicle" ? <VehicleDetailsPanel /> : null}
              {selection?.kind === "delivery" ? <DeliveryDetailsPanel /> : null}
              {selection?.kind === "driver" ? <DriverDetailsPanel /> : null}
            </ErrorBoundary>

            <ErrorBoundary scope="side-panel">
              {workspace.panel ? (
                <LazySidePanel
                  panel={workspace.panel}
                  onClose={workspace.closePanel}
                />
              ) : null}
            </ErrorBoundary>
          </div>

          <section
            aria-label="Live activity"
            className="h-[13.5rem] shrink-0 border-t border-border bg-card lg:h-[11rem]"
          >
            <ErrorBoundary scope="activity">
              <ActivityFeedPanel />
            </ErrorBoundary>
          </section>
        </main>
      </div>

      {commandPaletteOpen ? (
        <LazyCommandPalette
          open
          commands={commands}
          onOpenChange={setCommandPaletteOpen}
        />
      ) : null}

      {searchOpen ? (
        <LazyGlobalSearch open onOpenChange={setSearchOpen} />
      ) : null}

      {handoverVisible ? (
        <LazyHandoverReport onClose={() => setHandoverVisible(false)} />
      ) : null}

      {introVisible ? <BriefingPanel /> : null}

      <Toaster />
    </div>
  )
}

/*
 * The containers below each subscribe on their own behalf, and are mounted
 * only when they have something to show. A closed detail panel therefore costs
 * nothing — no subscription, no derivation, no render.
 */

function VehicleDetailsPanel() {
  const fleet = useFleet()
  const selectDelivery = useUiStore((state) => state.selectDelivery)
  const selectDriver = useUiStore((state) => state.selectDriver)
  const followSelection = useUiStore((state) => state.followSelection)
  const setFollowSelection = useUiStore((state) => state.setFollowSelection)

  return (
    <LazyVehicleDetails
      detail={fleet.selectedVehicle}
      following={followSelection}
      onClose={fleet.clearSelection}
      onToggleFollow={() => setFollowSelection(!followSelection)}
      onOpenDelivery={selectDelivery}
      onOpenDriver={selectDriver}
    />
  )
}

function DeliveryDetailsPanel() {
  const deliveries = useDeliveries()
  const dispatch = useDispatch()
  const focusVehicleOnMap = useUiStore((state) => state.focusVehicleOnMap)
  const selectDriver = useUiStore((state) => state.selectDriver)

  return (
    <LazyDeliveryDetails
      detail={deliveries.selectedDelivery}
      onClose={deliveries.clearSelection}
      onOpenVehicle={focusVehicleOnMap}
      onOpenDriver={selectDriver}
      onComplete={dispatch.complete}
      onCancel={dispatch.cancel}
    />
  )
}

function DriverDetailsPanel() {
  const drivers = useDrivers()
  const focusVehicleOnMap = useUiStore((state) => state.focusVehicleOnMap)
  const selectDelivery = useUiStore((state) => state.selectDelivery)

  return (
    <LazyDriverDetails
      detail={drivers.selectedDriver}
      onClose={drivers.clearSelection}
      onOpenVehicle={focusVehicleOnMap}
      onOpenDelivery={selectDelivery}
    />
  )
}

function ActivityFeedPanel() {
  const activity = useActivity()

  return (
    <ActivityFeed
      events={activity.events}
      total={activity.total}
      paused={activity.paused}
      severityFilter={activity.severityFilter}
      onSetPaused={activity.setPaused}
      onSetSeverityFilter={activity.setSeverityFilter}
      onSelect={activity.open}
    />
  )
}

function BriefingPanel() {
  const metrics = useMetrics()
  const deliveries = useDeliveries()
  const simulation = useSimulation()
  const dismissIntro = useUiStore((state) => state.dismissIntro)

  return (
    <LazyOperationsBriefing
      open
      metrics={metrics.metrics}
      totalDeliveries={deliveries.counts.total}
      running={simulation.running}
      onStart={simulation.start}
      onDismiss={dismissIntro}
    />
  )
}
