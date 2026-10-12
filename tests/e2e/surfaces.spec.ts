import { expect, test, type Page } from "@playwright/test"

/**
 * A sweep across every surface the console can show.
 *
 * The error boundary is good at containing a bad render, which also means a
 * broken panel can sit there looking like a designed empty state. This walks
 * the whole app and fails if any boundary trips or any uncaught error reaches
 * the page — the check the boundary itself cannot perform.
 */

/** Fails immediately with the panel and the boundary's own message. */
async function assertNoBoundary(page: Page, where: string): Promise<void> {
  const boundary = page.getByText("This panel stopped updating")
  if ((await boundary.count()) > 0) {
    const detail = await boundary.locator("..").innerText()
    throw new Error(`Error boundary tripped at "${where}":\n${detail}`)
  }
}

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  return errors
}

async function beginShift(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByRole("button", { name: /Begin simulation/i }).click()
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible()
}

/**
 * The map tab stays mounted behind the other tabs, so its container is
 * zero-sized while they are on screen. A camera animation works its path out by
 * dividing by the viewport size, which at zero yields non-finite coordinates
 * the map rejects — so selecting a vehicle from the rail while the board or
 * analytics tab was open used to take the workspace down.
 */
test("selecting a vehicle while the map is hidden does not break the workspace", async ({
  page,
}) => {
  const errors = collectErrors(page)
  await beginShift(page)

  for (const tab of ["g", "d"] as const) {
    await page.keyboard.press(tab)
    await page
      .getByRole("listbox", { name: "Fleet" })
      .getByRole("option")
      .first()
      .click()
    await assertNoBoundary(page, `vehicle selected from the ${tab} tab`)
  }

  // Returning to the map applies the focus that was held while it was hidden.
  await page.keyboard.press("m")
  await assertNoBoundary(page, "map after a held focus request")
  expect(errors).toEqual([])
})

for (const [label, viewport] of [
  ["desktop", { width: 1600, height: 950 }],
  ["tablet", { width: 834, height: 1112 }],
] as const) {
  test(`every surface opens cleanly on ${label}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors = collectErrors(page)
    await beginShift(page)

    const compact = viewport.width < 1024

    /** On tablet the rail lives behind a drawer, so open it on demand. */
    const openRail = async (): Promise<void> => {
      if (!compact) {
        return
      }
      const rail = page.getByRole("region", { name: "Fleet list" })
      if (!(await rail.isVisible())) {
        await page.getByRole("button", { name: "Open overview drawer" }).click()
      }
      await expect(rail).toBeVisible()
    }

    const closeRail = async (): Promise<void> => {
      if (!compact) {
        return
      }
      await page.getByRole("button", { name: "Close overview drawer" }).click()
      await expect(
        page.getByRole("region", { name: "Fleet list" })
      ).toBeHidden()
    }

    if (compact) {
      await openRail()
      await assertNoBoundary(page, "overview drawer")
      await closeRail()
    }

    // The delivery board, a delivery, and the driver behind it.
    await page.keyboard.press("d")
    await expect(page.getByRole("table")).toBeVisible()
    await assertNoBoundary(page, "delivery board")

    await page.getByRole("table").locator("tbody tr").first().click()
    await expect(page.getByText("Journey")).toBeVisible()
    await assertNoBoundary(page, "delivery details")

    const openDriver = page.getByRole("button", {
      name: /^Open driver record/,
    })
    if ((await openDriver.count()) > 0) {
      await openDriver.first().click()
      await expect(page.getByText("Workload", { exact: false })).toBeVisible()
      await assertNoBoundary(page, "driver details")
    }
    await page.keyboard.press("Escape")

    // Incidents, expanded to its log and assignee controls.
    await page.keyboard.press("i")
    const incident = page
      .locator("button[aria-expanded]")
      .filter({ hasText: /INC-/ })
    if ((await incident.count()) > 0) {
      await incident.first().click()
      await expect(page.getByText("Activity log")).toBeVisible()
      await assertNoBoundary(page, "incident details")
    }

    // Alerts, simulation controls and the shortcuts reference.
    await page.keyboard.press("a")
    await expect(page.getByRole("region", { name: "Alert centre" })).toBeVisible()
    await assertNoBoundary(page, "alert centre")

    await page.keyboard.press("?")
    await expect(
      page.getByRole("region", { name: "Keyboard shortcuts" })
    ).toBeVisible()
    await assertNoBoundary(page, "shortcuts")

    await page.keyboard.press("Control+k")
    await page
      .getByRole("option", { name: /Open simulation controls/ })
      .click()
    await expect(
      page.getByRole("region", { name: "Simulation control" })
    ).toBeVisible()
    await assertNoBoundary(page, "simulation control")
    await page.keyboard.press("Escape")

    // Search with live results.
    await page.keyboard.press("/")
    await page
      .getByLabel("Search vehicles, drivers, deliveries and routes")
      .fill("1")
    await expect(
      page.getByRole("listbox", { name: "Search results" })
    ).toBeVisible()
    await assertNoBoundary(page, "search results")
    await page.keyboard.press("Escape")

    // The map, with a vehicle selected, and the fleet rail paged.
    await page.keyboard.press("m")
    await openRail()
    await page
      .getByRole("listbox", { name: "Fleet" })
      .getByRole("option")
      .first()
      .click()
    await expect(
      page.getByRole("region", { name: /Vehicle .* details/ })
    ).toBeVisible()
    await assertNoBoundary(page, "vehicle details")
    await page.keyboard.press("Escape")

    await openRail()
    const rail = page.getByRole("region", { name: "Fleet list" })
    await rail.getByRole("button", { name: "Next page of vehicles" }).click()
    await rail
      .getByRole("combobox", { name: "Vehicles per page" })
      .selectOption("50")
    await assertNoBoundary(page, "fleet rail paging")
    await closeRail()

    // The two new workspace tabs.
    await page.keyboard.press("w")
    await expect(page.getByRole("table")).toBeVisible()
    await assertNoBoundary(page, "driver roster")

    await page.keyboard.press("c")
    await expect(page.getByRole("table")).toBeVisible()
    await assertNoBoundary(page, "route corridors")

    // The three new side panels.
    await page.keyboard.press("f")
    await expect(
      page.getByRole("region", { name: "Refuelling worklist" })
    ).toBeVisible()
    await assertNoBoundary(page, "fuel worklist")

    await page.keyboard.press("z")
    await expect(
      page.getByRole("region", { name: "Geofence zones" })
    ).toBeVisible()
    await assertNoBoundary(page, "geofence zones")

    await expect(page.getByRole("button", { name: "Add a zone" })).toBeVisible()
    await page.keyboard.press("Escape")

    // Export and saved views, both of which own their own popover state.
    await page.getByRole("button", { name: "Export data" }).click()
    await expect(page.getByRole("menu", { name: "Export data" })).toBeVisible()
    await page.getByRole("menuitem", { name: /Drivers/ }).click()
    await assertNoBoundary(page, "export menu")

    await page.getByRole("button", { name: "Saved views" }).click()
    await expect(page.getByRole("group", { name: "Saved views" })).toBeVisible()
    await assertNoBoundary(page, "saved views")
    await page.keyboard.press("Escape")

    // The handover report, which portals out of the shell.
    await page.keyboard.press("h")
    await expect(
      page.getByRole("dialog", { name: "Shift handover report" })
    ).toBeVisible()
    await assertNoBoundary(page, "handover report")
    await page.getByRole("button", { name: "Close handover report" }).click()

    // Analytics, once the rolling series has points in it.
    await page.keyboard.press("g")
    await expect(page.getByRole("region", { name: "Throughput" })).toBeVisible()
    await page.waitForTimeout(4_000)
    await assertNoBoundary(page, "analytics")

    // A reset, with panels open, replaces every store at once.
    await page.getByRole("button", { name: "Reset simulation" }).first().click()
    await page.waitForTimeout(2_500)
    await assertNoBoundary(page, "after reset")

    expect(errors).toEqual([])
  })
}
