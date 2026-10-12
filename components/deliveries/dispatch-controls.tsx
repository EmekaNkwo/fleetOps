"use client"

import { useState } from "react"
import { ArrowLeftRightIcon, FlagIcon, TruckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared/empty-state"
import { SectionHeading } from "@/components/shared/panel"
import { useDispatch } from "@/hooks"
import { formatSpeed } from "@/lib/formatting"
import type { Delivery, DeliveryPriority } from "@/types"

const PRIORITIES: readonly DeliveryPriority[] = [
  "STANDARD",
  "EXPRESS",
  "CRITICAL",
]

interface DispatchControlsProps {
  readonly delivery: Delivery
}

/**
 * Re-grading and reassignment, inside the delivery panel.
 *
 * The candidate list is only fetched when the operator opens it. It walks the
 * idle pool to rank vehicles by deadhead distance, and doing that on every
 * simulation commit — for a panel where the control is usually closed — would
 * be several hundred distance calculations a second for nothing.
 */
export function DispatchControls({ delivery }: DispatchControlsProps) {
  const dispatch = useDispatch()
  const [candidatesOpen, setCandidatesOpen] = useState(false)

  const candidates = candidatesOpen ? dispatch.candidatesFor(delivery.id) : []

  return (
    <section className="space-y-2">
      <SectionHeading>Dispatch</SectionHeading>

      <div>
        <p className="ops-label mb-1 flex items-center gap-1">
          <FlagIcon className="size-3" aria-hidden="true" />
          Priority
        </p>
        <div role="group" aria-label="Delivery priority" className="flex gap-1">
          {PRIORITIES.map((priority) => {
            const active = delivery.priority === priority
            return (
              <button
                key={priority}
                type="button"
                aria-pressed={active}
                onClick={() => dispatch.setPriority(delivery.id, priority)}
                className={cn(
                  "flex-1 rounded border px-1.5 py-1 text-[10px] font-medium capitalize transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active
                    ? "border-border bg-accent text-foreground"
                    : "border-border/60 text-muted-foreground hover:bg-accent"
                )}
              >
                {priority.toLowerCase()}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <Button
          variant="outline"
          size="xs"
          className="w-full"
          aria-expanded={candidatesOpen}
          onClick={() => setCandidatesOpen((open) => !open)}
        >
          <ArrowLeftRightIcon aria-hidden="true" />
          {candidatesOpen ? "Hide vehicles" : "Reassign to another vehicle"}
        </Button>

        {candidatesOpen ? (
          candidates.length === 0 ? (
            <div className="mt-1.5">
              <EmptyState
                icon={TruckIcon}
                title="No vehicle is free"
                description="Every other vehicle is carrying work or offline. Free one up and try again."
                compact
              />
            </div>
          ) : (
            <ul
              aria-label="Available vehicles, nearest first"
              className="ops-scroll mt-1.5 max-h-44 space-y-0.5 overflow-y-auto"
            >
              {candidates.map(({ vehicle, driverName }) => (
                <li key={vehicle.id}>
                  <button
                    type="button"
                    onClick={() => {
                      dispatch.reassign(delivery.id, vehicle.id)
                      setCandidatesOpen(false)
                    }}
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="ops-figure w-9 shrink-0 font-medium">
                      {vehicle.callSign}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {driverName} · {vehicle.type}
                    </span>
                    <span className="ops-figure shrink-0 text-muted-foreground">
                      {formatSpeed(vehicle.speed)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </section>
  )
}
