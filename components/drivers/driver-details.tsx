"use client"

import { PhoneIcon, StarIcon, TruckIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Field, FieldGrid, SectionHeading } from "@/components/shared/panel"
import { SlideOver } from "@/components/shared/slide-over"
import {
  DeliveryStatusBadge,
  VehicleStatusBadge,
} from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import {
  formatClock,
  formatNumber,
  formatRegion,
  humaniseEnum,
} from "@/lib/formatting"
import type { DriverDetail } from "@/hooks"

export interface DriverDetailsProps {
  readonly detail: DriverDetail | null
  onClose(): void
  onOpenVehicle(vehicleId: string): void
  onOpenDelivery(deliveryId: string): void
}

/**
 * Driver slide-over: who they are, what they are driving, and everything
 * currently assigned to them. The point is to answer "can I call this person,
 * and what will they be in the middle of?" in one glance.
 */
export function DriverDetails({
  detail,
  onClose,
  onOpenVehicle,
  onOpenDelivery,
}: DriverDetailsProps) {
  if (!detail) {
    return null
  }

  const { driver, vehicle, delivery, route, activeDeliveries } = detail

  return (
    <SlideOver
      open
      title={driver.name}
      subtitle={`${humaniseEnum(driver.status)} · ${formatRegion(driver.homeRegion)}`}
      badge={
        <span className="ops-figure flex items-center gap-1 text-sm">
          <StarIcon
            className="size-3.5 fill-amber-400 text-amber-400"
            aria-hidden="true"
          />
          {driver.rating.toFixed(1)}
          <span className="ml-2 text-[11px] text-muted-foreground">
            {formatNumber(driver.deliveriesCompleted)} completed ·{" "}
            {driver.yearsOfService} yrs
          </span>
        </span>
      }
      onClose={onClose}
      footer={
        <a
          href={`tel:${driver.phone.replace(/\s/g, "")}`}
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "w-full",
          })}
        >
          <PhoneIcon aria-hidden="true" />
          Call {driver.shortName}
        </a>
      }
    >
      <div className="space-y-4 p-3">
        <FieldGrid>
          <Field
            label="Phone"
            value={
              <a
                href={`tel:${driver.phone.replace(/\s/g, "")}`}
                className="ops-figure hover:underline"
              >
                {driver.phone}
              </a>
            }
          />
          <Field label="Duty status" value={humaniseEnum(driver.status)} />
          <Field label="Home region" value={formatRegion(driver.homeRegion)} />
          <Field
            label="Lifetime deliveries"
            value={
              <span className="ops-figure">
                {formatNumber(driver.deliveriesCompleted)}
              </span>
            }
          />
        </FieldGrid>

        <section className="space-y-2.5">
          <SectionHeading>Current assignment</SectionHeading>
          {vehicle ? (
            <button
              type="button"
              onClick={() => onOpenVehicle(vehicle.id)}
              className="flex w-full items-center justify-between gap-2 rounded border border-border px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="flex min-w-0 items-center gap-2">
                <TruckIcon
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="ops-figure block text-xs font-medium">
                    Vehicle {vehicle.callSign}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {vehicle.type} · {vehicle.plateNumber}
                  </span>
                </span>
              </span>
              <VehicleStatusBadge status={vehicle.status} />
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Not signed on to a vehicle.
            </p>
          )}

          {delivery && route ? (
            <button
              type="button"
              onClick={() => onOpenDelivery(delivery.id)}
              className="flex w-full items-center justify-between gap-2 rounded border border-border px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="min-w-0">
                <span className="ops-figure block text-xs font-medium">
                  #{delivery.reference}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {route.name} · ETA {formatClock(delivery.etaAt)}
                </span>
              </span>
              <DeliveryStatusBadge status={delivery.status} />
            </button>
          ) : null}
        </section>

        <section className="space-y-2">
          <SectionHeading>
            Workload · {activeDeliveries.length} active
          </SectionHeading>
          {activeDeliveries.length === 0 ? (
            <EmptyState
              icon={TruckIcon}
              title="Nothing assigned"
              description="This driver has no live deliveries. They are available for dispatch."
              compact
            />
          ) : (
            <ul className="space-y-1">
              {activeDeliveries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onOpenDelivery(entry.id)}
                    className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="ops-figure truncate font-medium">
                      #{entry.reference}
                    </span>
                    <span className="ops-figure shrink-0 text-muted-foreground">
                      {formatClock(entry.etaAt)}
                    </span>
                    <DeliveryStatusBadge status={entry.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </SlideOver>
  )
}
