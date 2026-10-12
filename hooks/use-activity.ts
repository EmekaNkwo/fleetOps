"use client"

import { useCallback, useMemo, useState } from "react"
import { useActivityStore, useUiStore } from "@/stores"
import type { ActivityEvent, Severity, SeverityFilter } from "@/types"

export interface UseActivityResult {
  readonly events: readonly ActivityEvent[]
  readonly total: number
  readonly severityFilter: SeverityFilter
  readonly paused: boolean
  setSeverityFilter(severity: SeverityFilter): void
  /** Freezes the feed so an operator can read a line without it scrolling. */
  setPaused(paused: boolean): void
  open(event: ActivityEvent): void
}

/**
 * Activity feed logic. The feed is a read-only projection of the event stream;
 * the only state it owns is the operator's own filter and hold.
 */
export function useActivity(): UseActivityResult {
  const live = useActivityStore((state) => state.events)
  const total = useActivityStore((state) => state.total)
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL")
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState<readonly ActivityEvent[]>([])

  const focusVehicleOnMap = useUiStore((state) => state.focusVehicleOnMap)
  const selectDelivery = useUiStore((state) => state.selectDelivery)

  const source = paused ? frozen : live

  const events = useMemo(
    () =>
      severityFilter === "ALL"
        ? source
        : source.filter((event) => event.severity === severityFilter),
    [source, severityFilter]
  )

  const hold = useCallback(
    (next: boolean): void => {
      if (next) {
        setFrozen(live)
      }
      setPaused(next)
    },
    [live]
  )

  const open = useCallback(
    (event: ActivityEvent): void => {
      if (event.vehicleId) {
        focusVehicleOnMap(event.vehicleId)
        return
      }
      if (event.deliveryId) {
        selectDelivery(event.deliveryId)
      }
    },
    [focusVehicleOnMap, selectDelivery]
  )

  return {
    events,
    total,
    severityFilter,
    paused,
    setSeverityFilter,
    setPaused: hold,
    open,
  }
}
