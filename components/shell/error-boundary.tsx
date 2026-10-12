"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { logger } from "@/lib/logger"

interface ErrorBoundaryProps {
  readonly children: ReactNode
  /** Rendered instead of the default panel, for scoped boundaries. */
  readonly fallback?: (error: Error, reset: () => void) => ReactNode
  readonly scope?: string
}

interface ErrorBoundaryState {
  readonly error: Error | null
  readonly componentStack: string | null
}

/**
 * The component the failure came from, e.g. `VehicleList`.
 *
 * Every boundary shows the same sentence, so a report of one is not locatable
 * on its own — six panels produce identical text. Naming the component turns a
 * screenshot into something that can be acted on.
 */
function originComponent(componentStack: string | null): string | null {
  const frame = componentStack
    ?.split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("at "))

  return frame ? (frame.slice(3).split(" ")[0] ?? null) : null
}

/**
 * Catches render-time failures.
 *
 * Without this, a single bad render anywhere in the tree unmounts the whole
 * console and leaves a blank page — the worst possible outcome for a screen
 * someone is meant to be monitoring. The simulation keeps running underneath,
 * so recovering is usually just a matter of remounting the subtree.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error(
      this.props.scope ?? "ui",
      "render failed",
      info.componentStack ?? error
    )
    this.setState({ componentStack: info.componentStack ?? null })
  }

  private readonly reset = (): void => {
    this.setState({ error: null, componentStack: null })
  }

  override render(): ReactNode {
    const { error, componentStack } = this.state

    if (!error) {
      return this.props.children
    }

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset)
    }

    return (
      <div
        role="alert"
        className="ops-sunken grid h-full min-h-[12rem] place-items-center p-6"
      >
        <div className="max-w-sm space-y-3 text-center">
          <TriangleAlertIcon
            className="mx-auto size-6 text-red-500"
            aria-hidden="true"
          />
          <h2 className="text-sm font-semibold">This panel stopped updating</h2>
          <p className="ops-figure text-[10px] tracking-wide text-muted-foreground uppercase">
            {[this.props.scope, originComponent(componentStack)]
              .filter(Boolean)
              .join(" · ") || "ui"}
          </p>
          <p className="text-xs text-muted-foreground">
            {error.message || "An unexpected rendering error occurred."}
          </p>
          <p className="text-[11px] text-muted-foreground">
            The simulation is still running and no operational data has been
            lost. Reloading this panel re-reads the current state.
          </p>
          {componentStack ? (
            <details className="text-left">
              <summary className="cursor-pointer text-[11px] text-muted-foreground">
                Component stack
              </summary>
              <pre className="ops-scroll mt-1 max-h-32 overflow-auto rounded border border-border bg-muted p-1.5 text-left text-[10px] leading-snug whitespace-pre-wrap text-muted-foreground">
                {componentStack.trim()}
              </pre>
            </details>
          ) : null}
          <Button size="sm" onClick={this.reset}>
            <RotateCcwIcon aria-hidden="true" />
            Reload panel
          </Button>
        </div>
      </div>
    )
  }
}
