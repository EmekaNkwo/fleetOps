import { METRIC_SAMPLE_INTERVAL_MS } from "@/data/config"
import { toActivityEvent, type ActivityLookup } from "@/lib/activity-messages"
import { fleetAvailability, fleetUtilisation } from "@/lib/calculations"
import { formatClock } from "@/lib/formatting"
import { logger } from "@/lib/logger"
import { createEventBatcher, eventBus, type EventBus } from "@/services/event-bus"
import { simulationEngine } from "@/services/simulation"
import { operationsNow } from "@/services/simulation/ops-clock"
import { operationsRecorder } from "@/services/simulation/recorder"
import type {
  ActivityEvent,
  AnyDomainEvent,
  Delivery,
  MetricSample,
  OperationsSnapshot,
  Vehicle,
} from "@/types"
import { useActivityStore } from "./activity-store"
import { useAlertStore } from "./alert-store"
import { useDeliveryStore, type DeliveryPatch } from "./delivery-store"
import { useIncidentStore } from "./incident-store"
import { useMetricsStore } from "./metrics-store"
import { useReferenceStore } from "./reference-store"
import { isReviewing } from "./replay-store"
import { useSimulationStore } from "./simulation-store"
import { useUiStore } from "./ui-store"
import { useVehicleStore, type VehiclePatch } from "./vehicle-store"

/** Batch flush cadence. One frame, so React commits at most once per paint. */
const FLUSH_INTERVAL_MS = 120

function lookup(): ActivityLookup {
  return {
    vehicleCallSign: (vehicleId) =>
      useVehicleStore.getState().byId[vehicleId]?.callSign ?? vehicleId,
    deliveryReference: (deliveryId) =>
      useDeliveryStore.getState().byId[deliveryId]?.reference ?? deliveryId,
    routeName: (routeId) =>
      useReferenceStore.getState().routesById[routeId]?.name ?? routeId,
  }
}

/** Loads a snapshot into every store. Used on bootstrap and on reset. */
export function applySnapshot(snapshot: OperationsSnapshot): void {
  const now = snapshot.generatedAt

  useReferenceStore.getState().replaceAll({
    routes: snapshot.routes,
    drivers: snapshot.drivers,
    customers: snapshot.customers,
    traffic: snapshot.traffic,
  })
  useVehicleStore.getState().replaceAll(snapshot.vehicles)
  useDeliveryStore.getState().replaceAll(snapshot.deliveries, now)
  useIncidentStore.getState().replaceAll(snapshot.incidents)
  useAlertStore.getState().replaceAll(snapshot.alerts)
  useActivityStore.getState().replaceAll(snapshot.activity)

  const deliveryCounts = useDeliveryStore.getState().counts
  const fleetCounts = useVehicleStore.getState().counts

  useMetricsStore.getState().reset()
  useMetricsStore.getState().setBaseline({
    activeDeliveries:
      deliveryCounts.inTransit +
      deliveryCounts.delayed +
      deliveryCounts.atRisk +
      deliveryCounts.assigned,
    delayed: deliveryCounts.delayed,
    atRisk: deliveryCounts.atRisk,
    vehiclesOffline: fleetCounts.offline,
    completedToday: deliveryCounts.completedToday,
    capturedAt: now,
    label: formatClock(now),
  })
}

function sampleMetrics(): void {
  const delivery = useDeliveryStore.getState()
  const fleet = useVehicleStore.getState().counts
  const at = operationsNow()

  // A keyframe rides the same timer as the metrics sample so the two describe
  // the same instant: scrubbing to a frame and reading the chart at that point
  // must not disagree.
  if (!isReviewing()) {
    const vehicles = useVehicleStore.getState()
    const deliveries = useDeliveryStore.getState()
    operationsRecorder.capture(
      at,
      vehicles.ids
        .map((id) => vehicles.byId[id])
        .filter((vehicle): vehicle is Vehicle => vehicle !== undefined),
      deliveries.ids
        .map((id) => deliveries.byId[id])
        .filter((entry): entry is Delivery => entry !== undefined)
    )
  }

  const sample: MetricSample = {
    at,
    label: formatClock(at),
    completed: delivery.counts.completedToday,
    delayed: delivery.counts.delayed,
    inTransit: delivery.counts.inTransit,
    onTimeRate: delivery.performance.onTimeRate,
    averageDelayMinutes: delivery.performance.averageDelayMinutes,
    etaAccuracy: delivery.performance.etaAccuracy,
  }

  useMetricsStore.getState().append(sample)
  void fleetUtilisation(fleet)
  void fleetAvailability(fleet)
}

/**
 * Connects the event bus to the stores.
 *
 * This module is the *only* place where events become state. Components never
 * subscribe to the bus and the engine never touches a store, so the dependency
 * direction stays one-way:
 *
 *   engine → bus → (this) → stores → hooks → components
 *
 * Three batchers absorb the firehose: vehicle patches, delivery patches and
 * activity lines are each coalesced into one store commit per flush interval,
 * which is what lets "fast" mode run hundreds of events a second without the
 * UI falling over.
 */
export function connectStores(bus: EventBus = eventBus): () => void {
  const vehicleBatcher = createEventBatcher<VehiclePatch>({
    intervalMs: FLUSH_INTERVAL_MS,
    onFlush: (patches) => {
      // Collapse repeat patches for the same vehicle: only the newest matters.
      const merged = new Map<string, Partial<Omit<Vehicle, "id">>>()
      for (const patch of patches) {
        merged.set(patch.id, { ...merged.get(patch.id), ...patch.changes })
      }
      useVehicleStore.getState().applyPatches(
        [...merged.entries()].map(([id, changes]) => ({ id, changes }))
      )
    },
  })

  const deliveryBatcher = createEventBatcher<DeliveryPatch>({
    intervalMs: FLUSH_INTERVAL_MS,
    onFlush: (patches) => {
      const merged = new Map<string, Partial<Omit<Delivery, "id">>>()
      for (const patch of patches) {
        merged.set(patch.id, { ...merged.get(patch.id), ...patch.changes })
      }
      useDeliveryStore.getState().applyPatches(
        [...merged.entries()].map(([id, changes]) => ({ id, changes })),
        operationsNow()
      )
    },
  })

  const activityBatcher = createEventBatcher<ActivityEvent>({
    intervalMs: FLUSH_INTERVAL_MS,
    onFlush: (events) => {
      useActivityStore.getState().append(events)
    },
  })

  const unsubscribers: (() => void)[] = []

  // --- Activity feed: a pure projection of the whole event stream ----------
  unsubscribers.push(
    bus.onAny((event: AnyDomainEvent) => {
      const selection = useUiStore.getState().selection
      const focusVehicleId =
        selection?.kind === "vehicle" ? selection.id : null
      const activity = toActivityEvent(event, lookup(), { focusVehicleId })
      if (activity) {
        activityBatcher.push(activity)
      }
    })
  )

  // --- Vehicle projection --------------------------------------------------
  unsubscribers.push(
    bus.on("vehicle.location.updated", ({ payload }) => {
      vehicleBatcher.push({
        id: payload.vehicleId,
        changes: {
          location: payload.location,
          heading: payload.heading,
          speed: payload.speed,
          lastSeen: operationsNow(),
        },
      })
    }),

    bus.on("vehicle.status.changed", ({ payload }) => {
      vehicleBatcher.push({
        id: payload.vehicleId,
        changes: { status: payload.to },
      })
    }),

    bus.on("vehicle.speed.changed", ({ payload }) => {
      vehicleBatcher.push({
        id: payload.vehicleId,
        changes: { speed: payload.to },
      })
    }),

    bus.on("vehicle.stopped", ({ payload }) => {
      vehicleBatcher.push({ id: payload.vehicleId, changes: { speed: 0 } })
    }),

    bus.on("vehicle.offline", ({ payload }) => {
      vehicleBatcher.push({
        id: payload.vehicleId,
        changes: { status: "OFFLINE", speed: 0 },
      })
    }),

    bus.on("vehicle.fuel.low", ({ payload }) => {
      vehicleBatcher.push({
        id: payload.vehicleId,
        changes: { fuelLevel: payload.fuelLevel },
      })
    })
  )

  // --- Delivery projection -------------------------------------------------
  unsubscribers.push(
    bus.on("delivery.created", ({ payload }) => {
      deliveryBatcher.flush()
      useDeliveryStore.getState().insert(payload.delivery, operationsNow())
    }),

    bus.on("delivery.assigned", ({ payload }) => {
      deliveryBatcher.push({
        id: payload.deliveryId,
        changes: {
          vehicleId: payload.vehicleId,
          driverId: payload.driverId,
          status: "ASSIGNED",
        },
      })
      vehicleBatcher.push({
        id: payload.vehicleId,
        changes: { deliveryId: payload.deliveryId },
      })
    }),

    bus.on("delivery.started", ({ payload }) => {
      deliveryBatcher.push({
        id: payload.deliveryId,
        changes: { status: "IN_TRANSIT", startedAt: operationsNow() },
      })
    }),

    bus.on("delivery.progress.updated", ({ payload }) => {
      deliveryBatcher.push({
        id: payload.deliveryId,
        changes: {
          progressFraction: payload.progressFraction,
          remainingKm: payload.remainingKm,
        },
      })
    }),

    bus.on("delivery.eta.revised", ({ payload }) => {
      deliveryBatcher.push({
        id: payload.deliveryId,
        changes: { etaAt: payload.to },
      })
    }),

    bus.on("delivery.delayed", ({ payload }) => {
      deliveryBatcher.push({
        id: payload.deliveryId,
        changes: { status: "DELAYED", delayMinutes: payload.delayMinutes },
      })
    }),

    bus.on("delivery.at_risk", ({ payload }) => {
      deliveryBatcher.push({
        id: payload.deliveryId,
        changes: { status: "AT_RISK" },
      })
    }),

    bus.on("delivery.recovered", ({ payload }) => {
      deliveryBatcher.push({
        id: payload.deliveryId,
        changes: { status: "IN_TRANSIT", delayMinutes: 0 },
      })
    }),

    bus.on("delivery.completed", ({ payload }) => {
      deliveryBatcher.push({
        id: payload.deliveryId,
        changes: {
          status: "COMPLETED",
          completedAt: payload.completedAt,
          progressFraction: 1,
          remainingKm: 0,
          delayMinutes: payload.delayMinutes,
          vehicleId: null,
        },
      })
    }),

    bus.on("delivery.cancelled", ({ payload }) => {
      deliveryBatcher.push({
        id: payload.deliveryId,
        changes: { status: "CANCELLED" },
      })
    }),

    bus.on("delivery.reassigned", ({ payload }) => {
      deliveryBatcher.push({
        id: payload.deliveryId,
        changes: {
          vehicleId: payload.toVehicleId,
          driverId: payload.driverId,
        },
      })
    }),

    bus.on("delivery.priority.changed", ({ payload }) => {
      deliveryBatcher.push({
        id: payload.deliveryId,
        changes: { priority: payload.to },
      })
    }),

    bus.on("delivery.timeline.appended", ({ payload }) => {
      // The timeline is append-only history, so it is merged immediately
      // rather than batched — a batch would overwrite concurrent appends.
      const current = useDeliveryStore.getState().byId[payload.deliveryId]
      if (!current) {
        return
      }
      useDeliveryStore.getState().applyPatches(
        [
          {
            id: payload.deliveryId,
            changes: { timeline: [...current.timeline, payload.entry] },
          },
        ],
        operationsNow()
      )
    })
  )

  // --- Traffic, alerts, incidents ------------------------------------------
  unsubscribers.push(
    bus.onMany(
      ["traffic.normal", "traffic.slow", "traffic.spike.detected", "traffic.cleared"],
      (event) => {
        if (
          event.name !== "traffic.normal" &&
          event.name !== "traffic.slow" &&
          event.name !== "traffic.spike.detected" &&
          event.name !== "traffic.cleared"
        ) {
          return
        }
        useReferenceStore.getState().applyTraffic([event.payload.condition])
      }
    ),

    bus.on("alert.raised", ({ payload }) => {
      useAlertStore.getState().insert(payload.alert)
    }),
    bus.on("alert.acknowledged", ({ payload }) => {
      useAlertStore.getState().setStatus(payload.alertId, "ACKNOWLEDGED", operationsNow())
    }),
    bus.on("alert.dismissed", ({ payload }) => {
      useAlertStore.getState().setStatus(payload.alertId, "DISMISSED", operationsNow())
    }),
    bus.on("alert.resolved", ({ payload }) => {
      useAlertStore.getState().setStatus(payload.alertId, "RESOLVED", operationsNow())
    }),

    bus.on("incident.created", ({ payload }) => {
      useIncidentStore.getState().insert(payload.incident)
    }),
    bus.onMany(
      ["incident.acknowledged", "incident.investigating", "incident.resolved"],
      (event) => {
        if (
          event.name !== "incident.acknowledged" &&
          event.name !== "incident.investigating" &&
          event.name !== "incident.resolved"
        ) {
          return
        }
        useIncidentStore.getState().applyTransition({
          incidentId: event.payload.incidentId,
          to: event.payload.to,
          note: event.payload.note,
          actor: event.payload.actor,
          at: operationsNow(),
        })
      }
    ),
    bus.on("incident.assigned", ({ payload }) => {
      useIncidentStore.getState().applyAssignment({
        incidentId: payload.incidentId,
        assignee: payload.assignee,
        at: operationsNow(),
      })
    })
  )

  // --- Simulation lifecycle ------------------------------------------------
  unsubscribers.push(
    bus.onMany(
      ["simulation.started", "simulation.paused", "simulation.tick", "simulation.reset"],
      () => {
        useSimulationStore.getState().syncStatus(simulationEngine.getStatus())
      }
    ),

    bus.on("simulation.error", ({ payload }) => {
      useSimulationStore
        .getState()
        .recordProcessingError(`${payload.scope}: ${payload.message}`)
    })
  )

  // A failing subscriber must not take the stream down with it.
  unsubscribers.push(
    bus.onError((error, event) => {
      logger.error("event-wiring", `handler failed for ${event.name}`, error)
      useSimulationStore.getState().recordProcessingError(error.message)
    })
  )

  // Reset republishes the whole dataset rather than a diff.
  unsubscribers.push(
    simulationEngine.onReset((snapshot) => {
      vehicleBatcher.flush()
      deliveryBatcher.flush()
      activityBatcher.flush()
      applySnapshot(snapshot)
    })
  )

  const metricsTimer = setInterval(sampleMetrics, METRIC_SAMPLE_INTERVAL_MS)
  sampleMetrics()

  return () => {
    clearInterval(metricsTimer)
    for (const unsubscribe of unsubscribers) {
      unsubscribe()
    }
    vehicleBatcher.dispose()
    deliveryBatcher.dispose()
    activityBatcher.dispose()
  }
}
