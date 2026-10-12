import { createEventBus, type EventBus } from "./event-bus"

/**
 * The application-wide bus. A single instance is intentional: it is the seam
 * between the simulation engine and the stores. Tests create their own bus by
 * importing `createEventBus` from `./event-bus` directly, so this module stays
 * the application entry point rather than a re-export of everything.
 */
export const eventBus: EventBus = createEventBus()

export type { EventBus } from "./event-bus"
export { createEventBatcher } from "./batcher"
