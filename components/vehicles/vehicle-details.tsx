"use client"

import {
  CrosshairIcon,
  FuelIcon,
  GaugeIcon,
  PackageIcon,
  PhoneIcon,
  StarIcon,
  WrenchIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldGrid, SectionHeading } from "@/components/shared/panel"
import { Meter, ProgressRail } from "@/components/shared/meter"
import { SlideOver } from "@/components/shared/slide-over"
import {
  DeliveryStatusBadge,
  TrafficBadge,
  VehicleStatusBadge,
} from "@/components/shared/status-badge"
import {
  formatClock,
  formatDateShort,
  formatDistance,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatSpeed,
  humaniseEnum,
} from "@/lib/formatting"
import { formatCoordinate } from "@/lib/geo"
import type { VehicleDetail } from "@/hooks"

export interface VehicleDetailsProps {
  readonly detail: VehicleDetail | null
  readonly following: boolean
  onClose(): void
  onToggleFollow(): void
  onOpenDelivery(deliveryId: string): void
  onOpenDriver(driverId: string): void
}

/**
 * Vehicle slide-over. Purely presentational: the composition of vehicle,
 * driver, route, delivery and traffic is done by `useFleet`, so this file is
 * only concerned with how that information is laid out and read.
 */
export function VehicleDetails({
  detail,
  following,
  onClose,
  onToggleFollow,
  onOpenDelivery,
  onOpenDriver,
}: VehicleDetailsProps) {
  if (!detail) {
    return null
  }

  const { vehicle, driver, route, delivery, progress, traffic } = detail
  const offline = vehicle.status === "OFFLINE"

  return (
    <SlideOver
      open
      title={`Vehicle ${vehicle.callSign}`}
      subtitle={`${vehicle.type} · ${vehicle.plateNumber}`}
      badge={
        <div className="flex flex-wrap items-center gap-1.5">
          <VehicleStatusBadge status={vehicle.status} />
          {traffic && traffic.level !== "normal" ? (
            <TrafficBadge level={traffic.level} />
          ) : null}
        </div>
      }
      onClose={onClose}
      footer={
        <div className="flex gap-1.5">
          <Button
            variant={following ? "default" : "outline"}
            size="sm"
            onClick={onToggleFollow}
            className="flex-1"
            aria-pressed={following}
          >
            <CrosshairIcon aria-hidden="true" />
            {following ? "Following" : "Follow on map"}
          </Button>
          {delivery ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenDelivery(delivery.id)}
              className="flex-1"
            >
              <PackageIcon aria-hidden="true" />
              Open delivery
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4 p-3">
        {offline ? (
          <p className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-700 dark:text-red-300">
            No telemetry received. Position shown is the last known fix at{" "}
            {formatClock(vehicle.lastSeen)}.
          </p>
        ) : null}

        <FieldGrid>
          <Field
            label="Current speed"
            value={
              <span className="ops-figure flex items-center gap-1.5">
                <GaugeIcon
                  className="size-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                {offline ? "—" : formatSpeed(vehicle.speed)}
              </span>
            }
          />
          <Field
            label="Heading"
            value={
              <span className="ops-figure">
                {Math.round(vehicle.heading)}° {compassPoint(vehicle.heading)}
              </span>
            }
          />
          <Field
            label="ETA"
            value={
              <span className="ops-figure">
                {delivery ? formatClock(delivery.etaAt) : "—"}
              </span>
            }
            hint={
              delivery && delivery.delayMinutes > 0
                ? `${formatMinutes(delivery.delayMinutes)} behind promise`
                : delivery
                  ? "Within promise"
                  : undefined
            }
          />
          <Field
            label="Distance remaining"
            value={
              <span className="ops-figure">
                {progress ? formatDistance(progress.remainingKm) : "—"}
              </span>
            }
          />
        </FieldGrid>

        {route && progress ? (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="truncate font-medium">{route.origin.name}</span>
              <span className="ops-figure text-muted-foreground">
                {formatPercent(progress.fraction)}
              </span>
              <span className="truncate font-medium">
                {route.destination.name}
              </span>
            </div>
            <ProgressRail
              fraction={progress.fraction}
              label={`Route progress for vehicle ${vehicle.callSign}`}
            />
            <p className="text-[11px] text-muted-foreground">
              {progress.nextWaypoint
                ? `Next waypoint: ${progress.nextWaypoint.name}`
                : "Approaching destination"}
              {" · "}
              {formatCoordinate(vehicle.location)}
            </p>
          </div>
        ) : null}

        <section className="space-y-2.5">
          <SectionHeading>Driver</SectionHeading>
          {driver ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpenDriver(driver.id)}
                  aria-label={`Open driver record for ${driver.name}`}
                  className="min-w-0 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <p className="truncate text-sm font-medium hover:underline">
                    {driver.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {humaniseEnum(driver.status)} ·{" "}
                    {driver.yearsOfService} years of service
                  </p>
                </button>
                <span className="ops-figure flex shrink-0 items-center gap-1 text-sm">
                  <StarIcon
                    className="size-3.5 fill-amber-400 text-amber-400"
                    aria-hidden="true"
                  />
                  {driver.rating.toFixed(1)}
                </span>
              </div>
              <FieldGrid>
                <Field
                  label="Phone"
                  value={
                    <a
                      href={`tel:${driver.phone.replace(/\s/g, "")}`}
                      className="ops-figure flex items-center gap-1.5 hover:underline"
                    >
                      <PhoneIcon
                        className="size-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {driver.phone}
                    </a>
                  }
                />
                <Field
                  label="Deliveries completed"
                  value={
                    <span className="ops-figure">
                      {formatNumber(driver.deliveriesCompleted)}
                    </span>
                  }
                />
              </FieldGrid>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No driver assigned.</p>
          )}
        </section>

        <section className="space-y-2.5">
          <SectionHeading>Vehicle</SectionHeading>
          <Meter
            label="Fuel level"
            fraction={vehicle.fuelLevel / 100}
            display={`${Math.round(vehicle.fuelLevel)}%`}
            tone={
              vehicle.fuelLevel <= 15
                ? "bad"
                : vehicle.fuelLevel <= 30
                  ? "warn"
                  : "good"
            }
            segments={16}
          />
          <FieldGrid>
            <Field
              label="Odometer"
              value={
                <span className="ops-figure">
                  {formatNumber(vehicle.mileageKm)} km
                </span>
              }
            />
            <Field
              label="Payload capacity"
              value={
                <span className="ops-figure">
                  {formatNumber(vehicle.capacityKg)} kg
                </span>
              }
            />
            <Field
              label="Last maintenance"
              value={
                <span className="flex items-center gap-1.5">
                  <WrenchIcon
                    className="size-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {formatDateShort(vehicle.lastMaintenance)}
                </span>
              }
            />
            <Field
              label="Fuel burn"
              value={
                <span className="flex items-center gap-1.5">
                  <FuelIcon
                    className="size-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {vehicle.capacityKg > 10_000 ? "Heavy haul" : "Standard"}
                </span>
              }
            />
          </FieldGrid>
        </section>

        <section className="space-y-2.5">
          <SectionHeading>Assignment</SectionHeading>
          {delivery && route ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpenDelivery(delivery.id)}
                  className="ops-figure truncate text-sm font-medium hover:underline"
                >
                  #{delivery.reference}
                </button>
                <DeliveryStatusBadge status={delivery.status} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {route.name} · {formatDistance(route.totalDistanceKm)} ·{" "}
                {humaniseEnum(delivery.priority)} priority
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Idle at {route?.origin.name ?? "depot"} — available for dispatch.
            </p>
          )}
        </section>
      </div>
    </SlideOver>
  )
}

/** 16-point compass label, so heading is readable without doing the maths. */
function compassPoint(heading: number): string {
  const points = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ]
  const index = Math.round((heading % 360) / 22.5) % 16
  return points[index] ?? "N"
}
