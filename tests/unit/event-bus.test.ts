import { describe, expect, it, vi } from "vitest"
import { createEventBus } from "@/services/event-bus/event-bus"
import { createEventBatcher } from "@/services/event-bus/batcher"

describe("event bus", () => {
  it("delivers an emitted event to its subscriber with a typed payload", () => {
    const bus = createEventBus()
    const handler = vi.fn()

    bus.on("vehicle.offline", handler)
    bus.emit("vehicle.offline", { vehicleId: "vehicle-1", reason: "Blowout" })

    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0]?.[0]
    expect(event.name).toBe("vehicle.offline")
    expect(event.payload.vehicleId).toBe("vehicle-1")
    expect(event.at).toBeTypeOf("number")
  })

  it("does not deliver events to subscribers of other names", () => {
    const bus = createEventBus()
    const handler = vi.fn()

    bus.on("vehicle.offline", handler)
    bus.emit("vehicle.online", { vehicleId: "vehicle-1" })

    expect(handler).not.toHaveBeenCalled()
  })

  it("stops delivering after unsubscribe", () => {
    const bus = createEventBus()
    const handler = vi.fn()

    const unsubscribe = bus.on("vehicle.online", handler)
    bus.emit("vehicle.online", { vehicleId: "vehicle-1" })
    unsubscribe()
    bus.emit("vehicle.online", { vehicleId: "vehicle-1" })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(bus.listenerCount("vehicle.online")).toBe(0)
  })

  it("delivers every event to wildcard subscribers", () => {
    const bus = createEventBus()
    const handler = vi.fn()

    bus.onAny(handler)
    bus.emit("vehicle.online", { vehicleId: "vehicle-1" })
    bus.emit("delivery.started", { deliveryId: "del-1" })

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it("supports subscribing to several names with one handler", () => {
    const bus = createEventBus()
    const handler = vi.fn()

    const unsubscribe = bus.onMany(
      ["vehicle.online", "vehicle.offline"],
      handler
    )
    bus.emit("vehicle.online", { vehicleId: "a" })
    bus.emit("vehicle.offline", { vehicleId: "a" })
    unsubscribe()
    bus.emit("vehicle.online", { vehicleId: "a" })

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it("runs a `once` subscriber exactly one time", () => {
    const bus = createEventBus()
    const handler = vi.fn()

    bus.once("delivery.started", handler)
    bus.emit("delivery.started", { deliveryId: "del-1" })
    bus.emit("delivery.started", { deliveryId: "del-2" })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("isolates a throwing handler so later subscribers still run", () => {
    const bus = createEventBus()
    const onError = vi.fn()
    const healthy = vi.fn()

    bus.onError(onError)
    bus.on("vehicle.online", () => {
      throw new Error("subscriber exploded")
    })
    bus.on("vehicle.online", healthy)

    expect(() => {
      bus.emit("vehicle.online", { vehicleId: "a" })
    }).not.toThrow()

    expect(healthy).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
  })

  it("tolerates unsubscribing from inside a handler", () => {
    const bus = createEventBus()
    const second = vi.fn()

    const unsubscribeFirst = bus.on("vehicle.online", () => {
      unsubscribeFirst()
    })
    bus.on("vehicle.online", second)

    bus.emit("vehicle.online", { vehicleId: "a" })

    expect(second).toHaveBeenCalledTimes(1)
  })

  it("drops every subscription on clear", () => {
    const bus = createEventBus()
    bus.on("vehicle.online", vi.fn())
    bus.onAny(vi.fn())

    bus.clear()

    expect(bus.listenerCount()).toBe(0)
  })
})

describe("event batcher", () => {
  it("coalesces pushes into a single flush", () => {
    vi.useFakeTimers()
    const onFlush = vi.fn()
    const batcher = createEventBatcher<number>({ onFlush, intervalMs: 20 })

    batcher.push(1)
    batcher.push(2)
    batcher.push(3)
    expect(onFlush).not.toHaveBeenCalled()

    vi.advanceTimersByTime(25)

    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(onFlush.mock.calls[0]?.[0]).toEqual([1, 2, 3])
    batcher.dispose()
    vi.useRealTimers()
  })

  it("flushes early once the queue cap is reached", () => {
    const onFlush = vi.fn()
    const batcher = createEventBatcher<number>({
      onFlush,
      intervalMs: 1_000,
      maxQueue: 2,
    })

    batcher.push(1)
    batcher.push(2)

    expect(onFlush).toHaveBeenCalledTimes(1)
    batcher.dispose()
  })

  it("ignores pushes after disposal", () => {
    vi.useFakeTimers()
    const onFlush = vi.fn()
    const batcher = createEventBatcher<number>({ onFlush, intervalMs: 10 })

    batcher.dispose()
    batcher.push(1)
    vi.advanceTimersByTime(50)

    expect(onFlush).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
