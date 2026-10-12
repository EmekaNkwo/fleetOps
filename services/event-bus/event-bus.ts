import { logger } from "@/lib/logger"
import { operationsNow } from "@/services/simulation/ops-clock"
import type {
  AnyDomainEvent,
  DomainEvent,
  DomainEventMap,
  DomainEventName,
} from "@/types"

export type EventHandler<N extends DomainEventName> = (
  event: DomainEvent<N>
) => void

export type AnyEventHandler = (event: AnyDomainEvent) => void

export type Unsubscribe = () => void

export interface EventBus {
  /** Publish an event. Handler failures are isolated and reported. */
  emit<N extends DomainEventName>(name: N, payload: DomainEventMap[N]): DomainEvent<N>
  /** Subscribe to one event name. */
  on<N extends DomainEventName>(name: N, handler: EventHandler<N>): Unsubscribe
  /** Subscribe to several event names with one handler. */
  onMany(
    names: readonly DomainEventName[],
    handler: AnyEventHandler
  ): Unsubscribe
  /** Subscribe to every event — used by the activity feed and devtools. */
  onAny(handler: AnyEventHandler): Unsubscribe
  once<N extends DomainEventName>(name: N, handler: EventHandler<N>): Unsubscribe
  off<N extends DomainEventName>(name: N, handler: EventHandler<N>): void
  /** Report handler errors without letting them break the emitting loop. */
  onError(handler: (error: Error, event: AnyDomainEvent) => void): Unsubscribe
  listenerCount(name?: DomainEventName): number
  clear(): void
}

let sequence = 0

function nextEventId(name: string): string {
  sequence += 1
  return `${name}#${sequence.toString(36)}`
}

/**
 * In-memory pub/sub. Deliberately tiny and dependency free: the simulation
 * publishes here and the stores subscribe here, which is the only coupling
 * between them. Nothing in the UI tree may import the simulation directly.
 *
 * Handler sets are copied before iteration so a handler that subscribes or
 * unsubscribes during dispatch cannot corrupt the current emit.
 */
export function createEventBus(): EventBus {
  const handlers = new Map<DomainEventName, Set<AnyEventHandler>>()
  const wildcard = new Set<AnyEventHandler>()
  const errorHandlers = new Set<(error: Error, event: AnyDomainEvent) => void>()

  const subscribe = (
    name: DomainEventName,
    handler: AnyEventHandler
  ): Unsubscribe => {
    const existing = handlers.get(name) ?? new Set<AnyEventHandler>()
    existing.add(handler)
    handlers.set(name, existing)

    return () => {
      const set = handlers.get(name)
      if (!set) {
        return
      }
      set.delete(handler)
      if (set.size === 0) {
        handlers.delete(name)
      }
    }
  }

  const reportError = (error: unknown, event: AnyDomainEvent): void => {
    const normalised =
      error instanceof Error ? error : new Error(String(error))

    if (errorHandlers.size === 0) {
      logger.error("event-bus", `handler failed for "${event.name}"`, normalised)
      return
    }

    for (const handler of [...errorHandlers]) {
      try {
        handler(normalised, event)
      } catch {
        // An error reporter that itself throws is not worth escalating.
      }
    }
  }

  const dispatch = (event: AnyDomainEvent): void => {
    const direct = handlers.get(event.name)
    if (direct && direct.size > 0) {
      for (const handler of [...direct]) {
        try {
          handler(event)
        } catch (error) {
          reportError(error, event)
        }
      }
    }

    if (wildcard.size > 0) {
      for (const handler of [...wildcard]) {
        try {
          handler(event)
        } catch (error) {
          reportError(error, event)
        }
      }
    }
  }

  return {
    emit(name, payload) {
      const event = {
        id: nextEventId(name),
        name,
        at: operationsNow(),
        payload,
      } as DomainEvent<typeof name>

      dispatch(event as AnyDomainEvent)
      return event
    },

    on(name, handler) {
      return subscribe(name, handler as AnyEventHandler)
    },

    onMany(names, handler) {
      const unsubscribers = names.map((name) => subscribe(name, handler))
      return () => {
        for (const unsubscribe of unsubscribers) {
          unsubscribe()
        }
      }
    },

    onAny(handler) {
      wildcard.add(handler)
      return () => {
        wildcard.delete(handler)
      }
    },

    once(name, handler) {
      const unsubscribe = subscribe(name, ((event) => {
        unsubscribe()
        ;(handler as AnyEventHandler)(event)
      }) as AnyEventHandler)
      return unsubscribe
    },

    off(name, handler) {
      handlers.get(name)?.delete(handler as AnyEventHandler)
    },

    onError(handler) {
      errorHandlers.add(handler)
      return () => {
        errorHandlers.delete(handler)
      }
    },

    listenerCount(name) {
      if (name) {
        return handlers.get(name)?.size ?? 0
      }
      let total = wildcard.size
      for (const set of handlers.values()) {
        total += set.size
      }
      return total
    },

    clear() {
      handlers.clear()
      wildcard.clear()
      errorHandlers.clear()
    },
  }
}
