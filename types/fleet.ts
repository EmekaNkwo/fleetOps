import type { Location, RegionId } from "./geo"

export type VehicleStatus =
  | "ON_ROUTE"
  | "IDLE"
  | "DELAYED"
  | "AT_RISK"
  | "OFFLINE"
  | "DELIVERED"

export type VehicleType =
  | "Mercedes Sprinter"
  | "Toyota Hiace"
  | "Mitsubishi Canter"
  | "Isuzu NPR"
  | "Ford Transit"
  | "MAN TGS Tractor"
  | "DAF XF Tractor"
  | "Toyota Dyna"

export type DriverStatus = "ON_DUTY" | "OFF_DUTY" | "ON_BREAK" | "UNREACHABLE"

export interface Driver {
  readonly id: string
  readonly name: string
  /** Display form used in dense tables, e.g. "Chukwuemeka N." */
  readonly shortName: string
  readonly phone: string
  readonly rating: number
  readonly deliveriesCompleted: number
  readonly status: DriverStatus
  readonly homeRegion: RegionId
  readonly yearsOfService: number
}

export interface Vehicle {
  readonly id: string
  /** Operational call sign shown on the map, e.g. "192". */
  readonly callSign: string
  readonly type: VehicleType
  readonly plateNumber: string
  readonly driverId: string
  readonly status: VehicleStatus
  readonly location: Location
  /** Ground speed in km/h. */
  readonly speed: number
  /** Heading in degrees clockwise from north. */
  readonly heading: number
  readonly routeId: string | null
  readonly deliveryId: string | null
  readonly homeRegion: RegionId
  readonly fuelLevel: number
  readonly mileageKm: number
  readonly lastMaintenance: number
  readonly capacityKg: number
  /** Epoch ms of the last telemetry packet received. */
  readonly lastSeen: number
}

export interface FleetCounts {
  readonly total: number
  readonly online: number
  readonly offline: number
  readonly onRoute: number
  readonly idle: number
  readonly delayed: number
  readonly atRisk: number
}
