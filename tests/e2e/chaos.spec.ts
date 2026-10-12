import { expect, test, type Page } from "@playwright/test"

/**
 * Randomised interaction fuzz.
 *
 * `surfaces.spec.ts` proves every panel opens; this proves they survive being
 * driven in an order nobody designed for. A seeded pseudo-random walk clicks
 * through the console while the simulation keeps mutating the stores
 * underneath, and the run fails on the first error boundary or uncaught
 * exception — with the sequence of moves that produced it, so the failure is
 * replayable rather than anecdotal.
 */

/** Seeded so a failing run can be re-run move for move. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Random = () => number

interface Move {
  readonly name: string
  run(page: Page, random: Random): Promise<void>
}

/** Clicks the first match if there is one; a missing target is not a failure. */
async function clickIfPresent(page: Page, selector: string): Promise<void> {
  const target = page.locator(selector).first()
  if ((await target.count()) === 0) {
    return
  }
  await target.click({ timeout: 2_000, force: true }).catch(() => {})
}

async function pressKey(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key)
}

const MOVES: readonly Move[] = [
  { name: "tab:map", run: (p) => pressKey(p, "m") },
  { name: "tab:board", run: (p) => pressKey(p, "d") },
  { name: "tab:analytics", run: (p) => pressKey(p, "g") },
  { name: "panel:alerts", run: (p) => pressKey(p, "a") },
  { name: "panel:incidents", run: (p) => pressKey(p, "i") },
  { name: "panel:simulation", run: (p) => pressKey(p, "s") },
  { name: "panel:shortcuts", run: (p) => pressKey(p, "?") },
  { name: "escape", run: (p) => pressKey(p, "Escape") },
  {
    name: "filter:status",
    run: (p) => clickIfPresent(p, '[aria-label="Vehicle status"] button'),
  },
  {
    name: "filter:status-last",
    run: async (p) => {
      const buttons = p.locator('[aria-label="Vehicle status"] button')
      const count = await buttons.count()
      if (count > 0) {
        await buttons.nth(count - 1).click({ force: true }).catch(() => {})
      }
    },
  },
  {
    name: "filter:region",
    run: (p) => clickIfPresent(p, '[aria-label="Region"] button'),
  },
  {
    name: "filter:clear",
    run: (p) => clickIfPresent(p, 'button:has-text("Clear")'),
  },
  {
    name: "fleet:next",
    run: (p) => clickIfPresent(p, '[aria-label="Next page of vehicles"]'),
  },
  {
    name: "fleet:prev",
    run: (p) => clickIfPresent(p, '[aria-label="Previous page of vehicles"]'),
  },
  {
    name: "fleet:page-size",
    run: async (p, random) => {
      const select = p.getByRole("combobox", { name: "Vehicles per page" })
      if ((await select.count()) === 0) {
        return
      }
      await select
        .first()
        .selectOption(["10", "25", "50"][Math.floor(random() * 3)] ?? "25")
        .catch(() => {})
    },
  },
  {
    name: "fleet:select",
    run: async (p, random) => {
      const options = p.getByRole("listbox", { name: "Fleet" }).getByRole("option")
      const count = await options.count()
      if (count === 0) {
        return
      }
      await options
        .nth(Math.floor(random() * count))
        .click({ force: true })
        .catch(() => {})
    },
  },
  {
    name: "board:row",
    run: (p) => clickIfPresent(p, "table tbody tr"),
  },
  {
    name: "board:next",
    run: (p) => clickIfPresent(p, '[aria-label="Next page"]'),
  },
  {
    name: "board:sort",
    run: (p) => clickIfPresent(p, "table thead th button"),
  },
  {
    name: "incident:expand",
    run: (p) => clickIfPresent(p, "button[aria-expanded]"),
  },
  {
    name: "alert:ack",
    run: (p) => clickIfPresent(p, 'button:has-text("Acknowledge")'),
  },
  {
    name: "driver:open",
    run: (p) => clickIfPresent(p, 'button[aria-label^="Open driver record"]'),
  },
  {
    name: "search",
    run: async (p) => {
      await pressKey(p, "/")
      const field = p.getByLabel(
        "Search vehicles, drivers, deliveries and routes"
      )
      if ((await field.count()) > 0) {
        await field.fill("a").catch(() => {})
      }
    },
  },
  {
    name: "palette",
    run: async (p, random) => {
      await pressKey(p, "Control+k")
      const options = p.getByRole("option")
      const count = await options.count()
      if (count > 0) {
        await options
          .nth(Math.floor(random() * count))
          .click({ force: true })
          .catch(() => {})
      }
    },
  },
]

/**
 * Several seeds and both layouts: one walk only ever visits one order, and the
 * tablet drawer puts the rail and the workspace in the same stacking context,
 * which the desktop layout never does.
 */
const ERROR_SEPARATOR = "\n---\n"

const RUNS = [
  { seed: 20_260_210, viewport: { width: 1600, height: 950 }, label: "desktop a" },
  { seed: 7_310_041, viewport: { width: 1600, height: 950 }, label: "desktop b" },
  { seed: 98_221_567, viewport: { width: 1280, height: 800 }, label: "laptop" },
  { seed: 44_190_833, viewport: { width: 834, height: 1112 }, label: "tablet" },
] as const

for (const run of RUNS) {
  test(`the console survives a randomised interaction walk (${run.label})`, async ({
    page,
  }) => {
    test.setTimeout(420_000)
    await page.setViewportSize(run.viewport)

    const errors: string[] = []
    page.on("pageerror", (error) =>
      errors.push(`${error.message}
${error.stack}`)
    )

    await page.goto("/")
    await page.getByRole("button", { name: /Begin simulation/i }).click()
    await expect(page.getByText("LIVE", { exact: true })).toBeVisible()

    // On tablet the rail is a drawer, so open it or half the moves are no-ops.
    if (run.viewport.width < 1024) {
      await page
        .getByRole("button", { name: "Open overview drawer" })
        .click()
        .catch(() => {})
    }

    const random = mulberry32(run.seed)
    const history: string[] = []

    for (let step = 0; step < 140; step += 1) {
      const move = MOVES[Math.floor(random() * MOVES.length)]
      if (!move) {
        continue
      }
      history.push(move.name)
      await move.run(page, random)

      const boundary = page.getByText("This panel stopped updating")
      if ((await boundary.count()) > 0) {
        const detail = await boundary.locator("..").innerText()
        throw new Error(
          `Error boundary tripped after ${step + 1} moves.
` +
            `Sequence: ${history.join(" → ")}

${detail}

` +
            `Page errors: ${errors.join(ERROR_SEPARATOR)}`
        )
      }
      if (errors.length > 0) {
        throw new Error(
          `Uncaught error after ${step + 1} moves.
` +
            `Sequence: ${history.join(" → ")}

${errors.join(ERROR_SEPARATOR)}`
        )
      }
    }
  })
}
