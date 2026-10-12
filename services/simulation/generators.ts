import { EVENT_WEIGHTS } from "@/data/config"
import { isInFlightDeliveryStatus } from "@/lib/calculations"
import type { SimulationEventKind, SimulationToggles } from "@/types"
import type { Emit } from "./emit"
import {
  CONGESTION_CAUSES,
  completeDelivery,
  dispatchNewDelivery,
  escalate,
  recover,
  resumeVehicle,
  setTraffic,
  stopVehicle,
  takeVehicleOffline,
  transitionIncident,
} from "./operations"
import type { World } from "./world"

const STOP_CAUSES: readonly string[] = [
  "Loading bay queue at the consignee",
  "Police checkpoint inspection",
  "Driver mandatory rest break",
  "Diversion around a collision",
  "Axle-load weighbridge queue",
]

const FAILURE_CAUSES: readonly string[] = [
  "Loss of air pressure on the rear axle",
  "Alternator failure — telemetry unit down",
  "Front tyre blowout",
  "Overheating engine, driver pulled over",
  "Clutch failure",
  "GSM blackspot, no telemetry received",
]

/**
 * Maps each enabled toggle to its weight. Disabling a scenario removes it from
 * the draw entirely rather than suppressing it afterwards, so a user who turns
 * off vehicle failures gets proportionally more of everything else instead of
 * dead ticks.
 */
function candidateKinds(
  toggles: SimulationToggles
): readonly { kind: SimulationEventKind; weight: number }[] {
  const candidates: { kind: SimulationEventKind; weight: number }[] = [
    { kind: "recovery", weight: EVENT_WEIGHTS.recovery },
  ]

  if (toggles.randomDelays) {
    candidates.push({ kind: "delay", weight: EVENT_WEIGHTS.randomDelays })
  }
  if (toggles.trafficSpikes) {
    candidates.push({ kind: "traffic", weight: EVENT_WEIGHTS.trafficSpikes })
  }
  if (toggles.vehicleFailures) {
    candidates.push({
      kind: "vehicle_failure",
      weight: EVENT_WEIGHTS.vehicleFailures,
    })
  }
  if (toggles.newDeliveries) {
    candidates.push({ kind: "new_delivery", weight: EVENT_WEIGHTS.newDeliveries })
  }
  if (toggles.deliveryCompletions) {
    candidates.push({
      kind: "delivery_completion",
      weight: EVENT_WEIGHTS.deliveryCompletions,
    })
  }

  return candidates
}

function pickEventKind(
  world: World,
  toggles: SimulationToggles
): SimulationEventKind {
  const candidates = candidateKinds(toggles)
  const index = world.rng.weighted(candidates.map((entry) => entry.weight))
  return candidates[index]?.kind ?? "recovery"
}

function liveVehicleIds(world: World): string[] {
  const ids: string[] = []
  for (const kin of world.kinematics.values()) {
    if (kin.routeId === null || kin.stoppedUntil !== null) {
      continue
    }
    const vehicle = world.vehicles.get(kin.vehicleId)
    if (vehicle && vehicle.status !== "OFFLINE") {
      ids.push(kin.vehicleId)
    }
  }
  return ids
}

/** Halts a moving vehicle, which is what turns into a real schedule slip. */
function generateDelay(world: World, emit: Emit): boolean {
  const candidates = liveVehicleIds(world)
  if (candidates.length === 0) {
    return false
  }
  const vehicleId = world.rng.pick(candidates)
  stopVehicle(
    world,
    emit,
    vehicleId,
    world.rng.pick(STOP_CAUSES),
    world.rng.int(12, 55)
  )
  return true
}

/** Escalates congestion on a corridor that still has room to get worse. */
function generateTraffic(world: World, emit: Emit): boolean {
  const routeIds = world.rng.shuffle(world.routeIds)

  for (const routeId of routeIds) {
    const condition = world.traffic.get(routeId)
    if (!condition || condition.level === "congested") {
      continue
    }
    const next = escalate(condition.level)
    const applied = setTraffic(world, emit, {
      routeId,
      level: next,
      description: world.rng.pick(CONGESTION_CAUSES),
    })
    if (applied) {
      return true
    }
  }

  return false
}

function generateVehicleFailure(world: World, emit: Emit): boolean {
  const candidates = liveVehicleIds(world)
  if (candidates.length === 0) {
    return false
  }
  takeVehicleOffline(
    world,
    emit,
    world.rng.pick(candidates),
    world.rng.pick(FAILURE_CAUSES),
    world.rng.int(30, 110)
  )
  return true
}

function generateNewDelivery(world: World, emit: Emit): boolean {
  return dispatchNewDelivery(world, emit) !== null
}

/**
 * Closes out whichever live delivery is nearest its destination. Picking the
 * closest rather than a random one keeps completions plausible — trucks do not
 * deliver from the middle of the expressway.
 */
function generateCompletion(world: World, emit: Emit): boolean {
  let bestId: string | null = null
  let bestRemaining = Number.POSITIVE_INFINITY

  for (const delivery of world.deliveries.values()) {
    if (
      !isInFlightDeliveryStatus(delivery.status) ||
      delivery.progressFraction < 0.8
    ) {
      continue
    }
    if (delivery.remainingKm < bestRemaining) {
      bestRemaining = delivery.remainingKm
      bestId = delivery.id
    }
  }

  if (!bestId) {
    return false
  }
  return completeDelivery(world, emit, bestId) !== null
}

/**
 * Walks the operation back towards health: clears congestion, reconnects
 * vehicles, resumes halted ones and progresses stale incidents. Without this
 * the board would only ever degrade.
 */
function generateRecovery(world: World, emit: Emit): boolean {
  const { rng } = world

  for (const routeId of rng.shuffle(world.routeIds)) {
    const condition = world.traffic.get(routeId)
    if (!condition || condition.level === "normal") {
      continue
    }
    const applied = setTraffic(world, emit, {
      routeId,
      level: recover(condition.level),
      description:
        recover(condition.level) === "normal"
          ? "Free flowing"
          : "Traffic easing, lanes reopening",
    })
    if (applied) {
      return true
    }
  }

  for (const kin of world.kinematics.values()) {
    if (kin.stoppedUntil !== null) {
      resumeVehicle(world, emit, kin.vehicleId)
      return true
    }
  }

  for (const incident of world.incidents.values()) {
    if (incident.status === "DETECTED") {
      return (
        transitionIncident(world, emit, {
          incidentId: incident.id,
          to: "ACKNOWLEDGED",
          note: "Picked up by the duty dispatcher",
          actor: "Control room",
        }) !== null
      )
    }
    if (incident.status === "ACKNOWLEDGED") {
      return (
        transitionIncident(world, emit, {
          incidentId: incident.id,
          to: "INVESTIGATING",
          note: "Driver contacted, awaiting recovery estimate",
          actor: incident.assignee ?? "Control room",
        }) !== null
      )
    }
  }

  return false
}

const RUNNERS: Readonly<
  Record<SimulationEventKind, (world: World, emit: Emit) => boolean>
> = {
  movement: () => false,
  delay: generateDelay,
  traffic: generateTraffic,
  vehicle_failure: generateVehicleFailure,
  new_delivery: generateNewDelivery,
  delivery_completion: generateCompletion,
  recovery: generateRecovery,
}

/**
 * Runs one operational event. Returns false when the chosen scenario had
 * nothing to act on — the caller retries with a different draw rather than
 * wasting the tick.
 */
export function runEventKind(
  world: World,
  emit: Emit,
  kind: SimulationEventKind
): boolean {
  return RUNNERS[kind](world, emit)
}

/** Draws a scenario and runs it, retrying a few times if the draw is barren. */
export function generateOperationalEvent(
  world: World,
  emit: Emit,
  toggles: SimulationToggles
): SimulationEventKind | null {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const kind = pickEventKind(world, toggles)
    if (runEventKind(world, emit, kind)) {
      return kind
    }
  }
  return null
}
