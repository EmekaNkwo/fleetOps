import type { Location } from "./geo"

export type GeofenceTrigger = "enter" | "exit" | "dwell"

export interface Geofence {
  readonly id: string
  readonly name: string
  readonly centre: Location
  readonly radiusKm: number
  /** Which crossings raise an alert. At least one is always set. */
  readonly triggers: readonly GeofenceTrigger[]
  /** Minutes inside the zone before a dwell fires. Ignored without `dwell`. */
  readonly dwellMinutes: number
  readonly enabled: boolean
  readonly createdAt: number
}

export interface GeofenceBreachPayload {
  readonly zoneId: string
  readonly zoneName: string
  readonly vehicleId: string
  readonly trigger: GeofenceTrigger
  /** Minutes spent inside, for a dwell breach. */
  readonly dwellMinutes: number
}
