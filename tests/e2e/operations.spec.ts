import { expect, test, type Page } from "@playwright/test"

/**
 * End-to-end coverage of the behaviour the product is judged on: the console
 * boots from the mock gateway, the simulation drives it, and a change in one
 * place is visible everywhere else.
 */

/** Dismisses the briefing and starts the simulation. */
async function beginShift(page: Page): Promise<void> {
  await page.goto("/")
  await expect(page.getByText("Live operations")).toBeVisible()
  await page.getByRole("button", { name: /Begin simulation/i }).click()
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible()
}

/**
 * Waits until the map has actually painted the fleet.
 *
 * The overlay only redraws when something could look different, so freezing the
 * simulation before the first paint leaves its hit index empty — and every
 * click on the map then lands on nothing.
 */
async function waitForFleetOnMap(page: Page): Promise<void> {
  await expect(page.getByText(/vehicles drawn/)).toContainText(
    /[1-9]\d* vehicles drawn/,
    { timeout: 30_000 }
  )
}

/** Parses the big number out of a KPI card. */
async function kpiValue(page: Page, label: string): Promise<number> {
  const card = page
    .getByRole("region", { name: "Operations overview" })
    .getByText(label, { exact: true })
    .locator("..")
  const text = (await card.textContent()) ?? ""
  const match = /(\d[\d,]*)/.exec(text.replace(label, ""))
  return Number((match?.[1] ?? "0").replace(/,/g, ""))
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw new Error(`Uncaught page error: ${error.message}`)
  })
})

test("boots into a populated control centre", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByText("Live operations")).toBeVisible()
  await expect(page.getByText("Deliveries monitored")).toBeVisible()

  await page.getByRole("button", { name: /Begin simulation/i }).click()

  await expect(page.getByRole("region", { name: "Operations overview" })).toBeVisible()
  await expect(page.getByText(/vehicles drawn/)).toBeVisible()
  expect(await kpiValue(page, "In Transit")).toBeGreaterThan(100)
})

test("streams live events and keeps moving vehicles on the map", async ({
  page,
}) => {
  await beginShift(page)

  const feed = page.getByRole("log", { name: "Operational activity" })
  await expect(feed).toBeVisible()

  const firstLine = await feed.locator("button").first().textContent()
  await page.waitForTimeout(6_000)
  const laterLine = await feed.locator("button").first().textContent()

  expect(laterLine).not.toBe(firstLine)
  await expect(page.getByText(/\d+ vehicles drawn/)).toBeVisible()
})

test("a traffic spike propagates into alerts and the delivery board", async ({
  page,
}) => {
  await beginShift(page)

  // Fire the scenario by hand so the assertion is about propagation, not luck.
  await page.keyboard.press("Control+k")
  await page.getByRole("listbox", { name: "Commands" }).waitFor()
  await page.getByRole("option", { name: /Trigger traffic spike/ }).click()

  await expect(
    page.getByRole("log", { name: "Operational activity" }).getByText(/Traffic/).first()
  ).toBeVisible()

  // Give the movement tick time to turn slower speeds into later ETAs.
  await page.waitForTimeout(8_000)

  await page.keyboard.press("a")
  const alerts = page.getByRole("region", { name: "Alert centre" })
  await expect(alerts).toBeVisible()
  await expect(alerts.getByText(/delayed|at risk|Traffic spike/i).first()).toBeVisible()
})

test("selecting a vehicle opens its details and follows it", async ({ page }) => {
  await beginShift(page)

  const fleet = page.getByRole("listbox", { name: "Fleet" })
  await fleet.getByRole("option").first().click()

  const panel = page.getByRole("region", { name: /details$/ })
  await expect(panel).toBeVisible()
  await expect(panel.getByText("Driver")).toBeVisible()
  await expect(panel.getByText("Current speed")).toBeVisible()

  await panel.getByRole("button", { name: /Follow on map/ }).click()
  await expect(panel.getByRole("button", { name: /Following/ })).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(panel).toBeHidden()
})

test("the delivery board sorts, filters and opens a delivery", async ({
  page,
}) => {
  await beginShift(page)
  await page.keyboard.press("d")

  const table = page.getByRole("table")
  await expect(table).toBeVisible()

  await page.getByRole("button", { name: /^Customer/ }).click()
  await expect(
    page.getByRole("columnheader", { name: /Customer/ })
  ).toHaveAttribute("aria-sort", "ascending")

  await page.getByRole("button", { name: "Delayed", exact: true }).first().click()
  await expect
    .poll(async () => table.locator("tbody tr").count(), { timeout: 15_000 })
    .toBeGreaterThan(0)
  await expect(table.getByText(/Delayed/).first()).toBeVisible()

  await table.locator("tbody tr").first().click()
  const panel = page.getByRole("region", { name: /details$/ })
  await expect(panel).toBeVisible()
  await expect(panel.getByText("Journey")).toBeVisible()
})

test("global search finds a delivery by its reference", async ({ page }) => {
  await beginShift(page)
  await page.keyboard.press("d")

  const reference = await page
    .getByRole("table")
    .locator("tbody tr")
    .first()
    .locator("td")
    .nth(1)
    .textContent()
  const cleaned = (reference ?? "").replace("#", "").trim()

  await page.keyboard.press("/")
  await page
    .getByLabel("Search vehicles, drivers, deliveries and routes")
    .fill(cleaned)

  const results = page.getByRole("listbox", { name: "Search results" })
  await expect(results.getByText(`#${cleaned}`).first()).toBeVisible()
})

test("alerts can be acknowledged from the alert centre", async ({ page }) => {
  await beginShift(page)
  await page.keyboard.press("a")

  const alerts = page.getByRole("region", { name: "Alert centre" })
  const firstAck = alerts.getByRole("button", { name: /^Acknowledge/ }).first()
  await firstAck.click()

  await expect(alerts.getByText("acknowledged").first()).toBeVisible()
})

test("incidents advance through their lifecycle", async ({ page }) => {
  await beginShift(page)
  await page.keyboard.press("i")

  const incidents = page.getByRole("region", { name: "Incident management" })
  await expect(incidents).toBeVisible()

  await incidents.locator("button[aria-expanded]").first().click()
  const acknowledge = incidents.getByRole("button", {
    name: "Acknowledge",
    exact: true,
  })

  if (await acknowledge.isEnabled()) {
    await acknowledge.click()
    await expect(incidents.getByRole("button", { name: "Investigate" })).toBeEnabled()
  } else {
    // Already past this stage, so the action must be disabled, not missing.
    await expect(acknowledge).toBeDisabled()
  }
})

test("the simulation can be paused, resumed and reset", async ({ page }) => {
  await beginShift(page)

  await page.getByRole("button", { name: "Pause simulation" }).click()
  await expect(page.getByText("PAUSED", { exact: true })).toBeVisible()

  const frozen = await kpiValue(page, "Delivered Today")
  await page.waitForTimeout(3_000)
  expect(await kpiValue(page, "Delivered Today")).toBe(frozen)

  await page.getByRole("button", { name: "Start simulation" }).click()
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Reset simulation" }).click()
  // Reset restores the seeded opening board exactly.
  await expect
    .poll(async () => kpiValue(page, "In Transit"), { timeout: 20_000 })
    .toBe(247)
})

test("analytics charts render from the live series", async ({ page }) => {
  await beginShift(page)
  await page.waitForTimeout(6_000)
  await page.keyboard.press("g")

  await expect(page.getByRole("region", { name: "Throughput" })).toBeVisible()
  await expect(
    page.getByRole("region", { name: "Fleet composition" }).locator("svg")
  ).toBeVisible()
  await expect(page.getByText("On-time delivery rate")).toBeVisible()
})

test("preferences survive a reload", async ({ page }) => {
  await beginShift(page)

  await page.getByRole("button", { name: "Toggle dark mode" }).click()
  await page.getByRole("button", { name: /^Offline/ }).click()

  await page.reload()

  // The briefing is marked as seen, so the console comes straight back.
  await expect(page.getByRole("region", { name: "Operations overview" })).toBeVisible()
  await expect(page.getByRole("button", { name: /^Offline/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    )
  ).toBe(true)
})

test("the console is keyboard navigable and exposes landmarks", async ({
  page,
}) => {
  await beginShift(page)

  await expect(page.getByRole("banner")).toBeVisible()
  await expect(page.getByRole("main")).toBeVisible()
  await expect(
    page.getByRole("region", { name: "Operations overview" })
  ).toBeVisible()

  await page.keyboard.press("?")
  await expect(
    page.getByRole("region", { name: "Keyboard shortcuts" })
  ).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(
    page.getByRole("region", { name: "Keyboard shortcuts" })
  ).toBeHidden()
})

/*
 * Regressions from the engineering audit. Each of these was a real defect
 * found by driving the built app, so each gets a test that would have caught
 * it.
 */

test("panning the map keeps the selected vehicle open", async ({ page }) => {
  await beginShift(page)
  await page.getByRole("listbox", { name: "Fleet" }).getByRole("option").first().click()

  const panel = page.getByRole("region", { name: /details$/ })
  await expect(panel).toBeVisible()

  const box = await page.locator(".mapboxgl-map").boundingBox()
  if (!box) {
    throw new Error("expected the map to be laid out")
  }

  await page.mouse.move(box.x + 500, box.y + 400)
  await page.mouse.down()
  await page.mouse.move(box.x + 640, box.y + 480, { steps: 12 })
  await page.mouse.up()

  // A pan is not a selection gesture.
  await expect(panel).toBeVisible()
})

test("the map zoom control does not clear the selection", async ({ page }) => {
  await beginShift(page)
  await page.getByRole("listbox", { name: "Fleet" }).getByRole("option").first().click()

  const panel = page.getByRole("region", { name: /details$/ })
  await expect(panel).toBeVisible()

  await page.locator(".mapboxgl-ctrl-zoom-in").click()
  await expect(panel).toBeVisible()
})

test("clicking empty map still clears the selection", async ({ page }) => {
  await beginShift(page)
  await waitForFleetOnMap(page)
  await page.getByRole("button", { name: "Pause simulation" }).click()
  await page.getByRole("listbox", { name: "Fleet" }).getByRole("option").first().click()
  await expect(page.getByRole("region", { name: /details$/ })).toBeVisible()
  await page.waitForTimeout(1_500)

  const box = await page.locator(".mapboxgl-map").boundingBox()
  if (!box) {
    throw new Error("expected the map to be laid out")
  }

  const cursor = () =>
    page.locator(".mapboxgl-canvas").evaluate((el) => getComputedStyle(el).cursor)

  // Somewhere with no vehicle under it, confirmed rather than assumed: the
  // camera is parked on the selection, so a fixed corner is a coin toss over
  // whether another vehicle happens to be there. The hover cursor runs the same
  // hit test the click does, which makes it a reliable oracle for "empty".
  let target: { x: number; y: number } | null = null
  for (const [fx, fy] of [
    [0.3, 0.3],
    [0.7, 0.3],
    [0.7, 0.6],
    [0.45, 0.25],
  ]) {
    const x = box.x + box.width * (fx as number)
    const y = box.y + box.height * (fy as number)
    await page.mouse.move(x, y)
    await page.waitForTimeout(80)
    if ((await cursor()) !== "pointer") {
      target = { x, y }
      break
    }
  }
  if (!target) {
    throw new Error("expected a patch of map with no vehicle on it")
  }

  await page.mouse.click(target.x, target.y)

  await expect(page.getByRole("region", { name: /details$/ })).toBeHidden()
})

test("a focused vehicle is drawn where the camera is pointed", async ({
  page,
}) => {
  await beginShift(page)

  // Paused once the fleet is on screen: at ninety times real time it crosses
  // the hit radius in about a second, which would make this a race rather than
  // a test.
  await waitForFleetOnMap(page)
  await page.getByRole("button", { name: "Pause simulation" }).click()
  await page.getByRole("listbox", { name: "Fleet" }).getByRole("option").first().click()
  await expect(page.getByRole("region", { name: /details$/ })).toBeVisible()

  // Measured after the panel has finished opening and the map has re-measured
  // around it, so the centre is the centre of the map the operator sees.
  await page.waitForTimeout(1_500)
  const box = await page.locator(".mapboxgl-map").boundingBox()
  if (!box) {
    throw new Error("expected the map to be laid out")
  }

  // Selecting a vehicle flies the camera to it, so it should now be under the
  // centre of the viewport. The fleet is painted on a canvas that projects
  // positions itself rather than asking Mapbox, so this is what catches the two
  // disagreeing — a mismatched world scale would put the fleet nowhere near
  // where the camera is looking.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  await expect(
    page.getByRole("region", { name: /^Vehicle \d+ details$/ })
  ).toBeVisible()
})

test("hovering a vehicle offers a pointer rather than the pan cursor", async ({
  page,
}) => {
  await beginShift(page)
  await waitForFleetOnMap(page)
  await page.getByRole("button", { name: "Pause simulation" }).click()
  await page.getByRole("listbox", { name: "Fleet" }).getByRole("option").first().click()
  await expect(page.getByRole("region", { name: /details$/ })).toBeVisible()
  await page.waitForTimeout(1_500)

  const box = await page.locator(".mapboxgl-map").boundingBox()
  if (!box) {
    throw new Error("expected the map to be laid out")
  }

  const cursor = () =>
    page
      .locator(".mapboxgl-canvas")
      .evaluate((el) => getComputedStyle(el).cursor)

  // Nothing hovered: the map is a surface to drag.
  await expect.poll(cursor).toBe("grab")

  // The selected vehicle sits under the centre after the camera flies to it.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect.poll(cursor).toBe("pointer")

  // Leaving the map hands the cursor back.
  await page.mouse.move(box.x + box.width / 2, box.y - 30)
  await expect.poll(cursor).toBe("grab")
})

test("the activity log is not an auto-announcing live region", async ({
  page,
}) => {
  await beginShift(page)

  // A feed gaining several lines a second must not interrupt a screen reader
  // on every one; escalations are announced separately instead.
  await expect(
    page.getByRole("log", { name: "Operational activity" })
  ).toHaveAttribute("aria-live", "off")
})

/* Features added after the audit. */

test("a driver opens from the vehicle panel and shows their workload", async ({
  page,
}) => {
  await beginShift(page)
  await page.getByRole("listbox", { name: "Fleet" }).getByRole("option").first().click()

  const vehiclePanel = page.getByRole("region", { name: /Vehicle .* details/ })
  await expect(vehiclePanel).toBeVisible()

  // The driver's name is the way in to their record.
  await vehiclePanel.getByRole("button", { name: /^Open driver record/ }).click()

  const driverPanel = page.getByRole("region", { name: /details$/ })
  await expect(driverPanel.getByText("Workload", { exact: false })).toBeVisible()
  await expect(driverPanel.getByText("Lifetime deliveries")).toBeVisible()
  await expect(driverPanel.getByRole("link", { name: /^Call / })).toBeVisible()
})

test("search opens a driver record rather than filtering the board", async ({
  page,
}) => {
  await beginShift(page)
  await page.keyboard.press("/")

  const input = page.getByLabel("Search vehicles, drivers, deliveries and routes")
  await input.fill("Chukwuemeka")

  const results = page.getByRole("listbox", { name: "Search results" })
  const driver = results.getByRole("option").filter({ hasText: /duty|break/i }).first()
  await driver.click()

  await expect(
    page.getByRole("region", { name: /details$/ }).getByText("Workload", {
      exact: false,
    })
  ).toBeVisible()
})

test("bulk actions appear for a selected page and can be cleared", async ({
  page,
}) => {
  await beginShift(page)
  await page.keyboard.press("d")

  await page
    .getByRole("checkbox", { name: "Select every delivery on this page" })
    .check()

  const bar = page.getByRole("region", { name: "Bulk actions" })
  await expect(bar).toBeVisible()
  await expect(bar.getByText(/\d+ selected/)).toBeVisible()

  await bar.getByRole("button", { name: "Clear selection" }).click()
  await expect(bar).toBeHidden()
})

test("bulk completing a page of in-transit deliveries closes them", async ({
  page,
}) => {
  await beginShift(page)

  // Paused, so the assertion measures the bulk action and not the simulation
  // refilling the page underneath it.
  await page.getByRole("button", { name: "Pause simulation" }).click()
  await expect(page.getByText("PAUSED", { exact: true })).toBeVisible()

  await page.keyboard.press("d")
  await page.getByRole("button", { name: "In Transit", exact: true }).first().click()

  const countLabel = page.getByText(/^\d[\d,]* deliveries$/)
  const readCount = async (): Promise<number> =>
    Number(((await countLabel.textContent()) ?? "0").replace(/\D/g, ""))

  const before = await readCount()
  expect(before).toBeGreaterThan(0)

  await page
    .getByRole("checkbox", { name: "Select every delivery on this page" })
    .check()

  const bar = page.getByRole("region", { name: "Bulk actions" })
  const complete = bar.getByRole("button", { name: /Mark \d+ delivered/ })
  const targeted = Number(
    ((await complete.textContent()) ?? "").replace(/\D/g, "")
  )
  expect(targeted).toBeGreaterThan(0)

  await complete.click()

  await expect(bar).toBeHidden()
  await expect.poll(readCount, { timeout: 15_000 }).toBe(before - targeted)
})

test("escalation channels are opt-in and survive a reload", async ({ page }) => {
  await beginShift(page)
  await page.keyboard.press("a")

  const sound = page.getByRole("checkbox", { name: "Sound" })
  await expect(sound).not.toBeChecked()
  await sound.check()

  await page.reload()

  // Wait for the console to come back before using a shortcut: the global key
  // handler is mounted with it, so a key pressed mid-bootstrap is simply lost.
  await expect(
    page.getByRole("region", { name: "Operations overview" })
  ).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press("a")

  await expect(page.getByRole("checkbox", { name: "Sound" })).toBeChecked()
})

test("keyboard shortcuts still work after ticking a row checkbox", async ({
  page,
}) => {
  await beginShift(page)
  await page.keyboard.press("d")

  await page
    .getByRole("checkbox", { name: "Select every delivery on this page" })
    .check()

  // A checkbox takes no text, so it must not swallow single-letter shortcuts.
  await page.keyboard.press("a")
  await expect(page.getByRole("region", { name: "Alert centre" })).toBeVisible()
})

/* Loading behaviour. */

test("the whole console appears at once, never half-populated", async ({
  page,
}) => {
  await page.goto("/")

  // The briefing renders over a complete console; dismissing it is the first
  // moment the shell itself is reachable.
  await page.getByRole("button", { name: /Begin simulation/i }).click()
  await expect(page.getByRole("banner")).toBeVisible({ timeout: 30_000 })

  // Every region of the initial view is present together. A shell that painted
  // before its data would show zeroed counters for a frame.
  await Promise.all([
    expect(page.getByRole("region", { name: "Operations overview" })).toBeVisible(),
    expect(page.getByRole("region", { name: "Fleet list" })).toBeVisible(),
    expect(page.getByRole("log", { name: "Operational activity" })).toBeVisible(),
    expect(page.getByRole("tablist", { name: "Workspace" })).toBeVisible(),
  ])

  // And the counts are the complete dataset, not a partial page of it.
  await expect(page.getByText("Fleet · 520")).toBeVisible()
  expect(await kpiValue(page, "In Transit")).toBe(247)
})

test("off-screen surfaces are fetched on demand, not at first load", async ({
  page,
}) => {
  const chunks: string[] = []
  page.on("response", (response) => {
    const url = response.url()
    if (url.endsWith(".js")) {
      chunks.push(url)
    }
  })

  await page.goto("/")
  await expect(page.getByRole("banner")).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1_500)
  const atFirstPaint = chunks.length

  // Analytics pulls in the charting library, which has no business being in
  // the initial bundle.
  await page.getByRole("button", { name: /Begin simulation/i }).click()
  await page.keyboard.press("g")
  await expect(page.getByRole("region", { name: "Throughput" })).toBeVisible()
  await page.waitForTimeout(1_000)

  expect(chunks.length).toBeGreaterThan(atFirstPaint)
})

/* Fleet rail pagination. */

test("the fleet rail pages through the whole fleet", async ({ page }) => {
  await beginShift(page)

  const rail = page.getByRole("region", { name: "Fleet list" })
  const list = page.getByRole("listbox", { name: "Fleet" })

  await expect(rail.getByText("Fleet · 520")).toBeVisible()
  await expect(rail.getByText("1–25 of 520")).toBeVisible()
  expect(await list.getByRole("option").count()).toBe(25)

  const firstCallSign = await list.getByRole("option").first().innerText()

  await rail.getByRole("button", { name: "Next page of vehicles" }).click()
  await expect(rail.getByText("26–50 of 520")).toBeVisible()
  expect(await list.getByRole("option").first().innerText()).not.toBe(
    firstCallSign
  )

  await rail.getByRole("button", { name: "Previous page of vehicles" }).click()
  await expect(rail.getByText("1–25 of 520")).toBeVisible()
})

test("the first page control is disabled at the start of the fleet", async ({
  page,
}) => {
  await beginShift(page)

  const rail = page.getByRole("region", { name: "Fleet list" })
  await expect(
    rail.getByRole("button", { name: "Previous page of vehicles" })
  ).toBeDisabled()
})

test("filtering the fleet returns the rail to the first page", async ({
  page,
}) => {
  await beginShift(page)

  const rail = page.getByRole("region", { name: "Fleet list" })
  await rail.getByRole("button", { name: "Next page of vehicles" }).click()
  await expect(rail.getByText("26–50 of 520")).toBeVisible()

  await page.getByRole("button", { name: /^Offline/ }).click()

  await expect(rail.getByText(/^1–\d+ of \d+$/)).toBeVisible()
  await expect(rail.getByText("Fleet · 520")).toBeHidden()
})

test("the fleet page size is remembered across a reload", async ({ page }) => {
  await beginShift(page)

  const rail = page.getByRole("region", { name: "Fleet list" })
  await rail
    .getByRole("combobox", { name: "Vehicles per page" })
    .selectOption("50")
  await expect(rail.getByText("1–50 of 520")).toBeVisible()

  await page.reload()
  await expect(
    page.getByRole("region", { name: "Fleet list" }).getByText("1–50 of 520")
  ).toBeVisible({ timeout: 30_000 })
})

test("choosing a vehicle on the map reveals it in the rail", async ({
  page,
}) => {
  await beginShift(page)

  const rail = page.getByRole("region", { name: "Fleet list" })
  await expect(rail.getByText("1–25 of 520")).toBeVisible()

  // A deep vehicle, reached through search rather than the rail itself.
  await page.keyboard.press("/")
  await page
    .getByLabel("Search vehicles, drivers, deliveries and routes")
    .fill("480")
  const results = page.getByRole("listbox", { name: "Search results" })
  await results.getByRole("option", { name: /Vehicle 480/ }).first().click()

  // The rail follows the selection rather than stranding it on another page.
  await expect(rail.getByText("1–25 of 520")).toBeHidden()
  await expect(
    page.getByRole("listbox", { name: "Fleet" }).getByRole("option", {
      selected: true,
    })
  ).toBeVisible()
})
