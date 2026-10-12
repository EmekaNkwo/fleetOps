import type { DomainEventMap, DomainEventName } from "@/types"

/**
 * The only way the simulation talks to the rest of the app. Passing this in
 * rather than importing the bus keeps every operation unit-testable with a
 * recording spy, and makes the dependency direction explicit:
 * engine → emit → bus → stores → UI, never the other way.
 */
export type Emit = <N extends DomainEventName>(
  name: N,
  payload: DomainEventMap[N]
) => void

export function createRecordingEmit(): {
  readonly emit: Emit
  readonly events: { name: DomainEventName; payload: unknown }[]
} {
  const events: { name: DomainEventName; payload: unknown }[] = []
  return {
    emit: (name, payload) => {
      events.push({ name, payload })
    },
    events,
  }
}
