"use client"

import { BanIcon, CheckCheckIcon, TruckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldGrid, SectionHeading } from "@/components/shared/panel"
import { ProgressRail } from "@/components/shared/meter"
import { SlideOver } from "@/components/shared/slide-over"
import { DeliveryStatusBadge } from "@/components/shared/status-badge"
import {
  formatClock,
  formatDistance,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatRegion,
  humaniseEnum,
} from "@/lib/formatting"
import { isActiveDeliveryStatus } from "@/lib/calculations"
import { DeliveryTimeline } from "./delivery-timeline"
import { DispatchControls } from "./dispatch-controls"
import type { DeliveryDetail } from "@/hooks"

export interface DeliveryDetailsProps {
  readonly detail: DeliveryDetail | null
  onClose(): void
  onOpenVehicle(vehicleId: string): void
  onOpenDriver(driverId: string): void
  onComplete(deliveryId: string): void
  onCancel(deliveryId: string): void
}

/**
 * Delivery slide-over: who it is for, where it is, what has happened to it, and
 * the two actions a dispatcher can take. The timeline is the centrepiece — it
 * is where a delay stops being a number and becomes a story.
 */
export function DeliveryDetails({
  detail,
  onClose,
  onOpenVehicle,
  onOpenDriver,
  onComplete,
  onCancel,
}: DeliveryDetailsProps) {
  if (!detail) {
    return null
  }

  const { delivery, customer, driver, vehicle, route, minutesToBreach } = detail
  const actionable = isActiveDeliveryStatus(delivery.status)

  return (
    <SlideOver
      open
      title={`Delivery #${delivery.reference}`}
      subtitle={`${formatRegion(delivery.originRegion)} → ${formatRegion(delivery.destinationRegion)}`}
      badge={
        <div className="flex flex-wrap items-center gap-1.5">
          <DeliveryStatusBadge status={delivery.status} />
          <span className="text-[11px] text-muted-foreground">
            {humaniseEnum(delivery.priority)} · {formatNumber(delivery.weightKg)} kg
          </span>
        </div>
      }
      onClose={onClose}
      footer={
        actionable ? (
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onComplete(delivery.id)}
            >
              <CheckCheckIcon aria-hidden="true" />
              Mark delivered
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={() => onCancel(delivery.id)}
            >
              <BanIcon aria-hidden="true" />
              Cancel
            </Button>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            This delivery is closed. No further action is available.
          </p>
        )
      }
    >
      <div className="space-y-4 p-3">
        {delivery.status === "DELAYED" ? (
          <p className="rounded border border-orange-500/40 bg-orange-500/10 px-2 py-1.5 text-[11px] text-orange-700 dark:text-orange-300">
            Running {formatMinutes(delivery.delayMinutes)} behind the promised
            time of {formatClock(delivery.promisedAt)}.
          </p>
        ) : null}
        {delivery.status === "AT_RISK" ? (
          <p className="rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
            {minutesToBreach > 0
              ? `Only ${formatMinutes(minutesToBreach)} of headroom left before the promise is breached.`
              : "Past the promised time — escalate with the customer."}
          </p>
        ) : null}

        <FieldGrid>
          <Field
            label="ETA"
            value={<span className="ops-figure">{formatClock(delivery.etaAt)}</span>}
            hint={`promised ${formatClock(delivery.promisedAt)}`}
          />
          <Field
            label="Delay"
            value={
              <span className="ops-figure">
                {delivery.delayMinutes > 0
                  ? formatMinutes(delivery.delayMinutes)
                  : "On time"}
              </span>
            }
            hint={`dispatch estimate ${formatClock(delivery.originalEtaAt)}`}
          />
          <Field
            label="Remaining"
            value={
              <span className="ops-figure">
                {formatDistance(delivery.remainingKm)}
              </span>
            }
          />
          <Field
            label="Progress"
            value={
              <span className="ops-figure">
                {formatPercent(delivery.progressFraction)}
              </span>
            }
          />
        </FieldGrid>

        <ProgressRail
          fraction={delivery.progressFraction}
          label={`Progress of delivery ${delivery.reference}`}
        />

        <section className="space-y-2.5">
          <SectionHeading>Consignment</SectionHeading>
          <FieldGrid>
            <Field label="Customer" value={customer?.name ?? "Unknown"} />
            <Field
              label="Contact"
              value={customer?.contact ?? "—"}
              hint={customer?.phone}
            />
            <Field label="Origin" value={route?.origin.name ?? "—"} />
            <Field label="Destination" value={route?.destination.name ?? "—"} />
          </FieldGrid>
        </section>

        {actionable ? <DispatchControls delivery={delivery} /> : null}

        <section className="space-y-2.5">
          <SectionHeading>Assigned resources</SectionHeading>
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
              <span className="ops-figure shrink-0 text-[11px] text-muted-foreground">
                {Math.round(vehicle.speed)} km/h
              </span>
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">
              No vehicle assigned yet.
            </p>
          )}
          <FieldGrid>
            <Field
              label="Driver"
              value={
                driver ? (
                  <button
                    type="button"
                    onClick={() => onOpenDriver(driver.id)}
                    aria-label={`Open driver record for ${driver.name}`}
                    className="truncate text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {driver.name}
                  </button>
                ) : (
                  "Unassigned"
                )
              }
            />
            <Field label="Driver phone" value={driver?.phone ?? "—"} />
          </FieldGrid>
        </section>

        <section className="space-y-2.5">
          <SectionHeading>Journey</SectionHeading>
          <DeliveryTimeline entries={delivery.timeline} />
        </section>
      </div>
    </SlideOver>
  )
}
