"use client"

import { ShieldCheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared/empty-state"
import { IncidentStatusBadge } from "@/components/shared/status-badge"
import { formatRelative, humaniseEnum } from "@/lib/formatting"
import { useNow } from "@/hooks"
import type { UseIncidentsResult } from "@/hooks"
import { IncidentDetails } from "./incident-details"
import { RaiseIncidentForm } from "./raise-incident-form"

interface IncidentPanelProps {
  readonly incidents: UseIncidentsResult
}

/**
 * Incident board: a scannable list on top, the selected incident expanded
 * underneath. Both live in one panel so an operator never loses the queue while
 * working a single case.
 */
export function IncidentPanel({ incidents }: IncidentPanelProps) {
  const now = useNow(5_000)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RaiseIncidentForm onRaise={incidents.raise} />

      <div className="ops-scroll min-h-0 flex-1 overflow-y-auto">
        {incidents.incidents.length === 0 ? (
          <EmptyState
            icon={ShieldCheckIcon}
            title="No incidents on the board"
            description="Mechanical failures, congestion and connectivity losses open one automatically — or raise one yourself with the button above."
            tone="positive"
          />
        ) : (
          <ul>
            {incidents.incidents.map((incident) => {
              const selected =
                incidents.selectedIncident?.incident.id === incident.id

              return (
                <li key={incident.id}>
                  <button
                    type="button"
                    onClick={() => incidents.select(incident.id)}
                    aria-expanded={selected}
                    className={cn(
                      "w-full border-b border-border px-2.5 py-2 text-left transition-colors",
                      "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                      selected && "bg-accent",
                      incident.status === "RESOLVED" && "opacity-60"
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="ops-figure truncate text-xs font-semibold">
                        {incident.reference}
                      </span>
                      <span className="ops-figure shrink-0 text-[10px] text-muted-foreground">
                        {formatRelative(incident.createdAt, now)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px]">{incident.title}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <IncidentStatusBadge status={incident.status} />
                      <span className="text-[10px] text-muted-foreground">
                        {humaniseEnum(incident.type)}
                        {incident.assignee ? ` · ${incident.assignee}` : ""}
                      </span>
                    </div>
                  </button>

                  {selected && incidents.selectedIncident ? (
                    <IncidentDetails
                      detail={incidents.selectedIncident}
                      assignees={incidents.assignees}
                      onAcknowledge={incidents.acknowledge}
                      onInvestigate={incidents.investigate}
                      onResolve={incidents.resolve}
                      onAssign={incidents.assign}
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
