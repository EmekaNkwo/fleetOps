import "@testing-library/jest-dom/vitest"
import { afterEach, vi } from "vitest"
import { cleanup } from "@testing-library/react"

/**
 * jsdom lacks a handful of browser APIs this app relies on. They are stubbed
 * here rather than guarded for in application code — production code should not
 * carry branches that exist only to satisfy the test environment.
 */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

/**
 * jsdom has no ResizeObserver. A no-op stub is not enough: the virtualisers
 * wait for their first measurement before rendering anything, so the stub
 * reports a size immediately on observe.
 */
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    constructor(private readonly callback: ResizeObserverCallback) {}

    observe(target: Element): void {
      const rect = target.getBoundingClientRect()
      // Asynchronous, like the real thing: a synchronous callback during
      // `observe` lands before React has committed the subscribing effect.
      queueMicrotask(() => {
        this.callback(
          [
            {
              target,
              contentRect: rect,
              borderBoxSize: [
                { inlineSize: rect.width, blockSize: rect.height },
              ],
            } as unknown as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver
        )
      })
    }

    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16) as unknown as number) as typeof window.requestAnimationFrame
  window.cancelAnimationFrame = ((handle: number) => {
    clearTimeout(handle)
  }) as typeof window.cancelAnimationFrame
}

/**
 * jsdom reports every element as zero-sized, which makes the virtualisers
 * conclude that nothing is on screen and render an empty list. Giving elements
 * a plausible box is the standard shim for testing virtualised UI.
 */
const VIEWPORT = { width: 1_280, height: 720 }

Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get(this: HTMLElement) {
    return Number(this.style.height.replace("px", "")) || VIEWPORT.height
  },
})

Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get(this: HTMLElement) {
    return Number(this.style.width.replace("px", "")) || VIEWPORT.width
  },
})

HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
  const height = Number(this.style.height.replace("px", "")) || VIEWPORT.height
  const width = Number(this.style.width.replace("px", "")) || VIEWPORT.width
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.localStorage.clear()
})
