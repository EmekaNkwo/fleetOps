"use client"

import { Button } from "@/components/ui/button"
import { Field, FieldGrid } from "@/components/shared/panel"
import { SeverityBadge } from "@/components/shared/status-badge"
import { formatClock, formatRegion, humaniseEnum } from "@/lib/formatting"
import { INCIDENT_STATUS_TOKENS } from "@/lib/status-tokens"
import type { IncidentDetail } from "@/hooks"
import type { IncidentStatus } from "@/types"

interface IncidentDetailsProps {
  readonly detail: IncidentDetail
  readonly assignees: readonly string[]
  onAcknowledge(incidentId: string): void
  onInvestigate(incidentId: string): void
  onResolve(incidentId: string): void
  onAssign(incidentId: string, assignee: string): void
}

const LIFECYCLE: readonly IncidentStatus[] = [
  "DETECTED",
  "ACKNOWLEDGED",
  "INVESTIGATING",
  "RESOLVED",
]

/**
 * Expanded incident. Actions are driven by `allowedTransitions`, which comes
 * from the same lifecycle rules the engine enforces — so a disabled button here
 * always reflects a real constraint rather than a UI guess.
 */
export function IncidentDetails({
  detail,
  assignees,
  onAcknowledge,
  onInvestigate,
  onResolve,
  onAssign,
}: IncidentDetailsProps) {
  const { incident, vehicle, route, allowedTransitions } = detail
  const can = (status: IncidentStatus): boolean =>
    allowedTransitions.includes(status)

  return (
    <div className="space-y-3 border-b border-border bg-muted/30 p-2.5">
      <ol className="flex items-center gap-1" aria-label="Incident lifecycle">
        {LIFECYCLE.map((status, index) => {
          const reached =
            LIFECYCLE.indexOf(incident.status) >= index
          return (
            <li key={status} className="flex flex-1 items-center gap-1">
              <span
                className={
                  reached
                    ? "flex-1 border-t-2 border-primary"
                    : "flex-1 border-t-2 border-border"
                }
                aria-hidden="true"
              />
              <span
                className={
                  reached
                    ? "text-[9px] font-semibold text-foreground"
                    : "text-[9px] text-muted-foreground"
                }
              >
                {INCIDENT_STATUS_TOKENS[status].code}
              </span>
            </li>
          )
        })}
      </ol>

      <p className="text-[11px] text-muted-foreground">{incident.description}</p>

      <FieldGrid>
        <Field label="Type" value={humaniseEnum(incident.type)} />
        <Field
          label="Severity"
          value={<SeverityBadge severity={incident.severity} />}
        />
        <Field
          label="Vehicle"
          value={vehicle ? `Vehicle ${vehicle.callSign}` : "—"}
          hint={vehicle?.plateNumber}
        />
        <Field label="Region" value={formatRegion(incident.region)} />
        <Field
          label="Created"
          value={<span className="ops-figure">{formatClock(incident.createdAt)}</span>}
        />
        <Field label="Assignee" value={incident.assignee ?? "Unassigned"} />
      </FieldGrid>

      {route ? (
        <p className="truncate text-[11px] text-muted-foreground">
          Route: {route.name}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <p className="ops-label">Activity log</p>
        <ol className="space-y-1">
          {incident.log.map((entry, index) => (
            <li
              key={`${entry.at}-${index}`}
              className="flex gap-2 text-[11px] text-muted-foreground"
            >
              <span className="ops-figure shrink-0">{formatClock(entry.at)}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-foreground">
                  {INCIDENT_STATUS_TOKENS[entry.status].label}
                </span>{" "}
                — {entry.note}{" "}
                <span className="opacity-70">({entry.actor})</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="xs"
          disabled={!can("ACKNOWLEDGED")}
          onClick={() => onAcknowledge(incident.id)}
        >
          Acknowledge
        </Button>
        <Button
          variant="outline"
          size="xs"
          disabled={!can("INVESTIGATING")}
          onClick={() => onInvestigate(incident.id)}
        >
          Investigate
        </Button>
        <Button
          variant="outline"
          size="xs"
          disabled={!can("RESOLVED")}
          onClick={() => onResolve(incident.id)}
        >
          Resolve
        </Button>

        <label className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="sr-only">
            Assign incident {incident.reference} to a dispatcher
          </span>
          Assign
          <select
            value={incident.assignee ?? ""}
            disabled={incident.status === "RESOLVED"}
            onChange={(event) => onAssign(incident.id, event.target.value)}
            className="rounded border border-border bg-card px-1 py-0.5 text-[10px] text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
          >
            <option value="">Unassigned</option>
            {assignees.map((assignee) => (
              <option key={assignee} value={assignee}>
                {assignee}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
