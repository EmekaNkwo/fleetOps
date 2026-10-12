"use client"

import { useId, useState } from "react"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { REGIONS } from "@/data/geography"
import { DISPATCHERS } from "@/data/people"
import type { RaiseIncidentInput } from "@/hooks"
import type { IncidentType, RegionId, Severity } from "@/types"

const TYPES: readonly IncidentType[] = [
  "TRAFFIC",
  "MECHANICAL",
  "ACCIDENT",
  "WEATHER",
  "SECURITY",
  "CUSTOMER",
]

const SEVERITIES: readonly Severity[] = ["INFO", "WARNING", "CRITICAL"]

const MAX_TITLE = 80
const MAX_DESCRIPTION = 400

interface RaiseIncidentFormProps {
  onRaise(input: RaiseIncidentInput): void
}

/**
 * Opening an incident by hand.
 *
 * Until now every incident on the board came from telemetry, which quietly
 * assumed the console sees everything. It does not: a driver phones in a
 * breakdown, a depot reports a theft, a customer escalates. Those are the
 * incidents that matter most and they had nowhere to live.
 *
 * The reporting dispatcher is required rather than defaulted — an incident with
 * no name against it is one nobody owns.
 */
export function RaiseIncidentForm({ onRaise }: RaiseIncidentFormProps) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<IncidentType>("MECHANICAL")
  const [severity, setSeverity] = useState<Severity>("WARNING")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [region, setRegion] = useState<RegionId | "">("")
  const [actor, setActor] = useState<string>(DISPATCHERS[0] ?? "Dispatcher")

  const fieldId = useId()
  const canSubmit = title.trim().length > 0 && description.trim().length > 0

  const reset = (): void => {
    setTitle("")
    setDescription("")
    setRegion("")
  }

  if (!open) {
    return (
      <div className="shrink-0 border-b border-border p-2">
        <Button
          variant="outline"
          size="xs"
          className="w-full"
          onClick={() => setOpen(true)}
        >
          <PlusIcon aria-hidden="true" />
          Open an incident
        </Button>
      </div>
    )
  }

  return (
    <form
      aria-label="Open an incident"
      className="shrink-0 space-y-2 border-b border-border p-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSubmit) {
          return
        }
        onRaise({
          type,
          severity,
          title: title.trim(),
          description: description.trim(),
          region: region === "" ? null : region,
          actor,
        })
        reset()
        setOpen(false)
      }}
    >
      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Type" htmlFor={`${fieldId}-type`}>
          <select
            id={`${fieldId}-type`}
            value={type}
            onChange={(event) => setType(event.target.value as IncidentType)}
            className={SELECT_CLASS}
          >
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {value.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Severity" htmlFor={`${fieldId}-severity`}>
          <select
            id={`${fieldId}-severity`}
            value={severity}
            onChange={(event) => setSeverity(event.target.value as Severity)}
            className={SELECT_CLASS}
          >
            {SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {value.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Summary" htmlFor={`${fieldId}-title`}>
        <input
          id={`${fieldId}-title`}
          type="text"
          required
          maxLength={MAX_TITLE}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Gearbox failure on the Lagos–Ibadan expressway"
          className={INPUT_CLASS}
        />
      </Field>

      <Field label="What happened" htmlFor={`${fieldId}-description`}>
        <textarea
          id={`${fieldId}-description`}
          required
          rows={3}
          maxLength={MAX_DESCRIPTION}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Reported by the driver at 14:20. Vehicle is off the carriageway and the recovery team has been called."
          className={`${INPUT_CLASS} resize-none`}
        />
      </Field>

      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Region" htmlFor={`${fieldId}-region`}>
          <select
            id={`${fieldId}-region`}
            value={region}
            onChange={(event) => setRegion(event.target.value as RegionId | "")}
            className={SELECT_CLASS}
          >
            <option value="">Not region specific</option>
            {REGIONS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Raised by" htmlFor={`${fieldId}-actor`}>
          <select
            id={`${fieldId}-actor`}
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            className={SELECT_CLASS}
          >
            {DISPATCHERS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex gap-1.5">
        <Button type="submit" size="xs" className="flex-1" disabled={!canSubmit}>
          Open incident
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            reset()
            setOpen(false)
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

const INPUT_CLASS =
  "w-full rounded border border-border bg-card px-1.5 py-1 text-[11px] text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

const SELECT_CLASS = `${INPUT_CLASS} capitalize`

function Field({
  label,
  htmlFor,
  children,
}: {
  readonly label: string
  readonly htmlFor: string
  readonly children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="ops-label mb-0.5 block">
        {label}
      </label>
      {children}
    </div>
  )
}
