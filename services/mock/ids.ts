/**
 * Reference generators. Counters are passed explicitly rather than held in
 * module scope so a reset produces exactly the same references as the first
 * run — the dataset has to be byte-identical for "Reset simulation" to mean
 * what it says.
 */
export interface ReferenceCounters {
  delivery: number
  incident: number
  alert: number
  activity: number
}

export function createCounters(): ReferenceCounters {
  return { delivery: 28_000, incident: 100, alert: 1, activity: 1 }
}

export function nextDeliveryReference(counters: ReferenceCounters): string {
  counters.delivery += 1
  return `DEL-${counters.delivery}`
}

export function nextIncidentReference(counters: ReferenceCounters): string {
  counters.incident += 1
  return `INC-${counters.incident.toString().padStart(4, "0")}`
}

export function nextAlertId(counters: ReferenceCounters): string {
  counters.alert += 1
  return `alert-${counters.alert}`
}

export function nextActivityId(counters: ReferenceCounters): string {
  counters.activity += 1
  return `activity-${counters.activity}`
}

export function vehicleId(index: number): string {
  return `vehicle-${index}`
}

/** Call signs run from 101 upwards, the way a real fleet numbers its trucks. */
export function callSign(index: number): string {
  return String(101 + index)
}

export function driverId(index: number): string {
  return `driver-${index}`
}

export function customerId(index: number): string {
  return `customer-${index}`
}

export function deliveryId(reference: string): string {
  return reference.toLowerCase()
}
