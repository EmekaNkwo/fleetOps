import type { EventRate, SimulationToggles, VehicleType } from "@/types"

/** Dataset size. Tuned to the "500 active deliveries" brief. */
export const DATASET = {
  seed: 20_251_010,
  vehicles: 520,
  deliveries: 500,
  drivers: 560,
  customers: 180,
  /** Deliveries closed before the session started, used to seed metrics. */
  completedBacklog: 180,
  incidents: 14,
  activityBacklog: 60,
} as const

export const VEHICLE_TYPES: readonly { type: VehicleType; capacityKg: number }[] = [
  { type: "Mercedes Sprinter", capacityKg: 1_200 },
  { type: "Toyota Hiace", capacityKg: 1_000 },
  { type: "Mitsubishi Canter", capacityKg: 3_500 },
  { type: "Isuzu NPR", capacityKg: 4_500 },
  { type: "Ford Transit", capacityKg: 1_400 },
  { type: "MAN TGS Tractor", capacityKg: 28_000 },
  { type: "DAF XF Tractor", capacityKg: 30_000 },
  { type: "Toyota Dyna", capacityKg: 2_000 },
]

/** Milliseconds between scheduler ticks for each event rate. */
export const RATE_INTERVALS: Readonly<Record<EventRate, number>> = {
  slow: 5_000,
  normal: 2_000,
  fast: 400,
}

/** Operational events emitted per tick for each rate. */
export const RATE_BURST: Readonly<Record<EventRate, number>> = {
  slow: 1,
  normal: 1,
  fast: 3,
}

export const RATE_LABELS: Readonly<Record<EventRate, string>> = {
  slow: "1 event / 5s",
  normal: "1 event / 2s",
  fast: "3 events / 0.4s",
}

/** Position integration runs on its own cadence, independent of event rate. */
export const MOVEMENT_INTERVAL_MS = 1_000

/**
 * Simulated seconds advanced per movement tick. Deliveries that would really
 * take hours therefore complete over minutes, which is what makes the demo
 * legible without making the kinematics fake.
 */
export const TIME_SCALE = 90

export const DEFAULT_TOGGLES: SimulationToggles = {
  randomDelays: true,
  vehicleFailures: true,
  trafficSpikes: true,
  newDeliveries: true,
  deliveryCompletions: true,
}

/** Relative weights used to pick which operational event fires next. */
export const EVENT_WEIGHTS = {
  randomDelays: 26,
  trafficSpikes: 22,
  vehicleFailures: 10,
  newDeliveries: 18,
  deliveryCompletions: 16,
  recovery: 20,
} as const

export const THRESHOLDS = {
  /** A delivery is DELAYED beyond this many minutes of slippage. */
  delayedMinutes: 15,
  /** Minutes of promised-time headroom below which a delivery is AT_RISK. */
  atRiskMinutes: 20,
  /** ETA within this many minutes of the dispatch estimate counts as accurate. */
  etaAccuracyToleranceMinutes: 12,
  /** Fuel percentage that raises a refuelling alert. */
  lowFuelPercent: 15,
  /** Telemetry gap after which a vehicle is treated as offline. */
  offlineAfterMs: 120_000,
} as const

/** Page sizes offered by the fleet rail. The rail is narrow, so these stay small. */
export const FLEET_PAGE_SIZES: readonly number[] = [10, 25, 50]
export const DEFAULT_FLEET_PAGE_SIZE = 25

export const ACTIVITY_LIMIT = 400
export const ALERT_LIMIT = 200
export const METRIC_SERIES_LIMIT = 48
/** Wall-clock interval at which a metrics sample is appended. */
export const METRIC_SAMPLE_INTERVAL_MS = 10_000
