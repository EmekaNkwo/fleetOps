import { ErrorBoundary } from "@/components/shell/error-boundary"
import { OperationsControlCenter } from "@/components/shell/operations-control-center"

/**
 * The whole product is one operational surface, so there is a single route.
 * Workspace switching, panels and detail views are UI state rather than
 * navigation — a dispatcher should never lose the live map to a page change.
 */
export default function Page() {
  return (
    <ErrorBoundary scope="app">
      <OperationsControlCenter />
    </ErrorBoundary>
  )
}
