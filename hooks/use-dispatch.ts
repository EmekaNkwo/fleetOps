"use client"

import { useCallback } from "react"
import { simulationEngine } from "@/services/simulation"
import { useActionJournal } from "@/stores/action-journal"
import { useDeliveryStore, useReferenceStore, useVehicleStore } from "@/stores"
import { isReviewing } from "@/stores/replay-store"
import { notify } from "@/stores/toast-store"
import type { DeliveryPriority, Vehicle } from "@/types"

export interface DispatchCandidate {
  readonly vehicle: Vehicle
  readonly driverName: string
}

export interface UseDispatchResult {
  /** Idle vehicles that could take this delivery, nearest first. */
  candidatesFor(deliveryId: string): readonly DispatchCandidate[]
  reassign(deliveryId: string, vehicleId: string): void
  setPriority(deliveryId: string, priority: DeliveryPriority): void
  /** Creates a new order; without a corridor the engine picks one. */
  dispatchNew(routeId?: string): void
  cancel(deliveryId: string): void
  complete(deliveryId: string): void
}

const PRIORITY_LABEL: Readonly<Record<DeliveryPriority, string>> = {
  STANDARD: "standard",
  EXPRESS: "express",
  CRITICAL: "critical",
}

/**
 * Operator dispatch actions.
 *
 * Three things happen for every action and they are deliberately in one place:
 * the engine is asked to change the world, the operator is told what happened,
 * and — where the change is genuinely reversible — an undo entry is recorded.
 * Scattering those three across call sites is how consoles end up with actions
 * that work but cannot be undone, or that silently fail.
 */
export function useDispatch(): UseDispatchResult {
  const record = useActionJournal((state) => state.record)

  /**
   * Commands are refused while the console is showing a past snapshot. The
   * command would be applied to the present using a decision made about the
   * past — the one thing review mode must never allow.
   */
  const blocked = useCallback((): boolean => {
    if (!isReviewing()) {
      return false
    }
    notify({
      tone: "warning",
      message: "The console is in review mode",
      detail: "Return to live before changing anything.",
    })
    return true
  }, [])

  const candidatesFor = useCallback(
    (deliveryId: string): readonly DispatchCandidate[] => {
      const driversById = useReferenceStore.getState().driversById
      return simulationEngine
        .reassignmentCandidates(deliveryId)
        .map((vehicle) => ({
          vehicle,
          driverName: driversById[vehicle.driverId]?.shortName ?? "Unassigned",
        }))
    },
    []
  )

  const reassign = useCallback(
    (deliveryId: string, vehicleId: string): void => {
      if (blocked()) {
        return
      }

      const before = useDeliveryStore.getState().byId[deliveryId]
      const previousVehicleId = before?.vehicleId ?? null
      const reference = before?.reference ?? deliveryId

      if (!simulationEngine.reassignDeliveryTo(deliveryId, vehicleId)) {
        notify({
          tone: "error",
          message: "Reassignment refused",
          detail: "That vehicle is no longer free to take the delivery.",
        })
        return
      }

      const callSign =
        useVehicleStore.getState().byId[vehicleId]?.callSign ?? vehicleId

      const entryId = previousVehicleId
        ? record({
            label: `Reassigned #${reference}`,
            refusalHint:
              "The original vehicle has since been dispatched elsewhere.",
            undo: () =>
              simulationEngine.reassignDeliveryTo(
                deliveryId,
                previousVehicleId,
                "Reassignment undone"
              ),
          })
        : null

      notify({
        tone: "success",
        message: `Delivery #${reference} reassigned`,
        detail: `Now carried by ${callSign}`,
        ...(entryId === null
          ? {}
          : {
              action: {
                label: "Undo",
                run: () => {
                  undoThrough(entryId, "Reassignment undone", "Could not undo")
                },
              },
            }),
      })
    },
    [record, blocked]
  )

  const setPriority = useCallback(
    (deliveryId: string, priority: DeliveryPriority): void => {
      if (blocked()) {
        return
      }
      const before = useDeliveryStore.getState().byId[deliveryId]
      if (!before) {
        return
      }
      const previous = before.priority

      if (!simulationEngine.setDeliveryPriorityTo(deliveryId, priority)) {
        return
      }

      const entryId = record({
        label: `Re-graded #${before.reference}`,
        refusalHint: "The delivery has since closed.",
        undo: () =>
          simulationEngine.setDeliveryPriorityTo(deliveryId, previous),
      })

      notify({
        tone: "info",
        message: `Delivery #${before.reference} is now ${PRIORITY_LABEL[priority]}`,
        action: {
          label: "Undo",
          run: () => {
            undoThrough(
              entryId,
              "Priority restored",
              "Could not restore priority"
            )
          },
        },
      })
    },
    [record, blocked]
  )

  const dispatchNew = useCallback(
    (routeId?: string): void => {
      if (blocked()) {
        return
      }
      const created = simulationEngine.dispatchDelivery(routeId)
      if (!created) {
        notify({
          tone: "warning",
          message: "Nothing to dispatch with",
          detail: "Every vehicle is already carrying work or offline.",
        })
        return
      }

      const delivery = useDeliveryStore.getState().byId[created]
      notify({
        tone: "success",
        message: `Dispatched #${delivery?.reference ?? created}`,
        detail: "The order is on the road and visible on the map.",
      })
    },
    [blocked]
  )

  const cancel = useCallback(
    (deliveryId: string): void => {
      if (blocked()) {
        return
      }
      const before = useDeliveryStore.getState().byId[deliveryId]
      if (!before) {
        return
      }
      const previousVehicleId = before.vehicleId

      simulationEngine.cancelDeliveryNow(deliveryId, "Cancelled by dispatcher")

      // Reinstating needs somewhere to put the goods. Without the original
      // vehicle there is no honest reversal, so no undo is offered.
      const entryId = previousVehicleId
        ? record({
            label: `Cancelled #${before.reference}`,
            refusalHint: "The vehicle has already been given other work.",
            undo: () =>
              simulationEngine.restoreCancelledDelivery(
                deliveryId,
                previousVehicleId
              ),
          })
        : null

      notify({
        tone: "warning",
        message: `Delivery #${before.reference} cancelled`,
        ...(entryId === null
          ? {}
          : {
              action: {
                label: "Undo",
                run: () => {
                  undoThrough(
                    entryId,
                    "Cancellation reversed",
                    "Could not reinstate the delivery"
                  )
                },
              },
            }),
      })
    },
    [record, blocked]
  )

  const complete = useCallback(
    (deliveryId: string): void => {
      if (blocked()) {
        return
      }
      const before = useDeliveryStore.getState().byId[deliveryId]
      simulationEngine.completeDeliveryNow(deliveryId)

      // No undo entry: see `action-journal` — a completed delivery is already
      // counted into the day's throughput.
      notify({
        tone: "success",
        message: `Delivery #${before?.reference ?? deliveryId} completed`,
      })
    },
    [blocked]
  )

  return { candidatesFor, reassign, setPriority, dispatchNew, cancel, complete }
}

/** Runs one journal entry and reports whether the world allowed it. */
function undoThrough(
  entryId: string,
  successMessage: string,
  failureMessage: string
): void {
  const entry = useActionJournal
    .getState()
    .entries.find((candidate) => candidate.id === entryId)

  const applied = useActionJournal.getState().undoEntry(entryId)

  notify(
    applied
      ? { tone: "success", message: successMessage }
      : {
          tone: "error",
          message: failureMessage,
          detail: entry?.refusalHint ?? "The operation is no longer available.",
        }
  )
}
