"use client"

import dynamic from "next/dynamic"
import { LoadingPanel, Spinner } from "@/components/shared/spinner"

/**
 * Everything that is not on screen at first paint.
 *
 * The initial view is the header, the overview rail, the map and the activity
 * feed — those load eagerly and appear together. The delivery board, the
 * analytics charts, the detail panels, the side panels and the two dialogs are
 * all reachable only by an explicit action, so their code is fetched when that
 * action happens rather than inflating the first load.
 *
 * Recharts alone is the single largest dependency in the app, and it is only
 * needed on the analytics tab.
 *
 * All of these are client-only (`ssr: false`): they are driven entirely by
 * live store state that does not exist during prerendering.
 */

/** Panel-sized fallback for a region that occupies the workspace. */
function PanelFallback({ message }: { readonly message: string }) {
  return <LoadingPanel message={message} />
}

/** Slide-over-sized fallback, matching the panel width so nothing shifts. */
function SlideOverFallback() {
  return (
    <aside
      aria-busy="true"
      className="relative flex w-[23rem] shrink-0 items-center justify-center border-l border-border bg-card"
    >
      <Spinner size="md" label="Loading details" className="text-muted-foreground" />
    </aside>
  )
}

export const LazyDeliveryBoard = dynamic(
  () =>
    import("@/components/deliveries/delivery-board").then(
      (module) => module.DeliveryBoard
    ),
  { ssr: false, loading: () => <PanelFallback message="Loading delivery board" /> }
)

export const LazyAnalyticsView = dynamic(
  () =>
    import("@/components/analytics/analytics-view").then(
      (module) => module.AnalyticsView
    ),
  { ssr: false, loading: () => <PanelFallback message="Loading analytics" /> }
)

export const LazyDriverRoster = dynamic(
  () =>
    import("@/components/drivers/driver-roster").then(
      (module) => module.DriverRoster
    ),
  { ssr: false, loading: () => <PanelFallback message="Loading roster" /> }
)

export const LazyRouteBoard = dynamic(
  () =>
    import("@/components/routes/route-board").then((module) => module.RouteBoard),
  { ssr: false, loading: () => <PanelFallback message="Loading corridors" /> }
)

export const LazyVehicleDetails = dynamic(
  () =>
    import("@/components/vehicles/vehicle-details").then(
      (module) => module.VehicleDetails
    ),
  { ssr: false, loading: () => <SlideOverFallback /> }
)

export const LazyDeliveryDetails = dynamic(
  () =>
    import("@/components/deliveries/delivery-details").then(
      (module) => module.DeliveryDetails
    ),
  { ssr: false, loading: () => <SlideOverFallback /> }
)

export const LazyDriverDetails = dynamic(
  () =>
    import("@/components/drivers/driver-details").then(
      (module) => module.DriverDetails
    ),
  { ssr: false, loading: () => <SlideOverFallback /> }
)

export const LazySidePanel = dynamic(
  () => import("./side-panel").then((module) => module.SidePanel),
  { ssr: false, loading: () => <SlideOverFallback /> }
)

export const LazyCommandPalette = dynamic(
  () =>
    import("@/components/search/command-palette").then(
      (module) => module.CommandPalette
    ),
  { ssr: false }
)

export const LazyGlobalSearch = dynamic(
  () =>
    import("@/components/search/global-search").then(
      (module) => module.GlobalSearch
    ),
  { ssr: false }
)

export const LazyHandoverReport = dynamic(
  () =>
    import("@/components/handover/handover-report").then(
      (module) => module.HandoverReport
    ),
  { ssr: false }
)

export const LazyOperationsBriefing = dynamic(
  () =>
    import("@/components/intro/operations-briefing").then(
      (module) => module.OperationsBriefing
    ),
  { ssr: false }
)
