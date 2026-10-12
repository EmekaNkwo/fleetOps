"use client"

import { BanIcon, CheckCheckIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/formatting"

interface BulkActionBarProps {
  readonly selectedCount: number
  /** How many of the selection are still open to action. */
  readonly actionableCount: number
  onComplete(): void
  onCancel(): void
  onClear(): void
}

/**
 * Bulk actions for the delivery board.
 *
 * The bar reports the actionable count separately from the raw selection: a
 * selection that includes already-closed deliveries would otherwise offer a
 * button that silently does less than it says. When nothing in the selection
 * can be acted on, the actions disappear rather than failing quietly.
 */
export function BulkActionBar({
  selectedCount,
  actionableCount,
  onComplete,
  onCancel,
  onClear,
}: BulkActionBarProps) {
  if (selectedCount === 0) {
    return null
  }

  const closedCount = selectedCount - actionableCount

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="flex h-9 shrink-0 items-center gap-2 border-b border-primary/30 bg-primary/5 px-2"
    >
      <span className="ops-figure text-[11px] font-medium">
        {formatNumber(selectedCount)} selected
      </span>
      {closedCount > 0 ? (
        <span className="text-[11px] text-muted-foreground">
          {formatNumber(closedCount)} already closed
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-1">
        {actionableCount > 0 ? (
          <>
            <Button variant="outline" size="xs" onClick={onComplete}>
              <CheckCheckIcon aria-hidden="true" />
              Mark {formatNumber(actionableCount)} delivered
            </Button>
            <Button variant="destructive" size="xs" onClick={onCancel}>
              <BanIcon aria-hidden="true" />
              Cancel {formatNumber(actionableCount)}
            </Button>
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Nothing in this selection can still be actioned
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClear}
          aria-label="Clear selection"
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
