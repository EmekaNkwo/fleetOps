"use client"

import { useMemo } from "react"
import { useTheme } from "next-themes"
import { useUiStore } from "@/stores"
import { useDispatch } from "./use-dispatch"
import { useReplay } from "./use-replay"
import { useSimulation } from "./use-simulation"
import { useUndo } from "./use-undo"

export type CommandGroup =
  | "Navigate"
  | "Dispatch"
  | "Simulation"
  | "View"
  | "Scenarios"

export interface Command {
  readonly id: string
  readonly label: string
  readonly group: CommandGroup
  readonly hint?: string
  readonly shortcut?: string
  run(): void
}

/**
 * The command registry backing both the palette and the keyboard shortcuts.
 *
 * Defining commands once means a shortcut and its palette entry can never
 * drift apart, and the palette's list is generated rather than hand-maintained.
 */
export function useCommands(): readonly Command[] {
  const simulation = useSimulation()
  const dispatch = useDispatch()
  const undo = useUndo()
  const replay = useReplay()
  const { resolvedTheme, setTheme } = useTheme()

  const setWorkspace = useUiStore((state) => state.setWorkspace)
  const openPanel = useUiStore((state) => state.openPanel)
  const setSearchOpen = useUiStore((state) => state.setSearchOpen)
  const setCommandPaletteOpen = useUiStore(
    (state) => state.setCommandPaletteOpen
  )
  const resetFilters = useUiStore((state) => state.resetFilters)
  const showRoutes = useUiStore((state) => state.showRoutes)
  const densityView = useUiStore((state) => state.densityView)
  const setDensityView = useUiStore((state) => state.setDensityView)
  const setShowRoutes = useUiStore((state) => state.setShowRoutes)
  const followSelection = useUiStore((state) => state.followSelection)
  const setFollowSelection = useUiStore((state) => state.setFollowSelection)
  const showIntro = useUiStore((state) => state.showIntro)
  const setHandoverVisible = useUiStore((state) => state.setHandoverVisible)

  return useMemo<readonly Command[]>(() => {
    const close = (): void => {
      setCommandPaletteOpen(false)
    }

    const commands: Command[] = [
      {
        id: "search",
        label: "Search vehicles, drivers and deliveries",
        group: "Navigate",
        shortcut: "/",
        run: () => {
          close()
          setSearchOpen(true)
        },
      },
      {
        id: "focus-map",
        label: "Focus map",
        group: "Navigate",
        shortcut: "M",
        run: () => {
          close()
          setWorkspace("map")
        },
      },
      {
        id: "open-deliveries",
        label: "Open delivery board",
        group: "Navigate",
        shortcut: "D",
        run: () => {
          close()
          setWorkspace("deliveries")
        },
      },
      {
        id: "open-roster",
        label: "Open driver roster",
        group: "Navigate",
        shortcut: "W",
        run: () => {
          close()
          setWorkspace("drivers")
        },
      },
      {
        id: "open-routes",
        label: "Open route corridors",
        group: "Navigate",
        shortcut: "C",
        run: () => {
          close()
          setWorkspace("routes")
        },
      },
      {
        id: "open-analytics",
        label: "Open analytics",
        group: "Navigate",
        shortcut: "G",
        run: () => {
          close()
          setWorkspace("analytics")
        },
      },
      {
        id: "open-alerts",
        label: "Open alerts",
        group: "Navigate",
        shortcut: "A",
        run: () => {
          close()
          openPanel("alerts")
        },
      },
      {
        id: "open-incidents",
        label: "Open incidents",
        group: "Navigate",
        shortcut: "I",
        run: () => {
          close()
          openPanel("incidents")
        },
      },
      {
        id: "open-fuel",
        label: "Open refuelling worklist",
        group: "Navigate",
        shortcut: "F",
        run: () => {
          close()
          openPanel("fuel")
        },
      },
      {
        id: "open-zones",
        label: "Open geofence zones",
        group: "Navigate",
        shortcut: "Z",
        hint: "Draw boundaries that alert when vehicles cross them",
        run: () => {
          close()
          openPanel("zones")
        },
      },
      {
        id: "open-settings",
        label: "Open alerting settings",
        group: "View",
        run: () => {
          close()
          openPanel("settings")
        },
      },
      {
        id: "open-simulation",
        label: "Open simulation controls",
        group: "Simulation",
        run: () => {
          close()
          openPanel("simulation")
        },
      },
      {
        id: "simulation-toggle",
        label: simulation.running ? "Pause simulation" : "Start simulation",
        group: "Simulation",
        shortcut: "S",
        run: () => {
          close()
          simulation.toggle()
        },
      },
      {
        id: "simulation-reset",
        label: "Reset simulation",
        group: "Simulation",
        hint: "Restores the opening dataset",
        shortcut: "R",
        run: () => {
          close()
          simulation.reset()
        },
      },
      {
        id: "rate-slow",
        label: "Set event rate: slow",
        group: "Simulation",
        run: () => {
          close()
          simulation.setRate("slow")
        },
      },
      {
        id: "rate-normal",
        label: "Set event rate: normal",
        group: "Simulation",
        run: () => {
          close()
          simulation.setRate("normal")
        },
      },
      {
        id: "rate-fast",
        label: "Set event rate: fast",
        group: "Simulation",
        run: () => {
          close()
          simulation.setRate("fast")
        },
      },
      {
        id: "toggle-theme",
        label: `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`,
        group: "View",
        shortcut: "T",
        run: () => {
          close()
          setTheme(resolvedTheme === "dark" ? "light" : "dark")
        },
      },
      {
        id: "toggle-routes",
        label: showRoutes ? "Hide route overlay" : "Show route overlay",
        group: "View",
        run: () => {
          close()
          setShowRoutes(!showRoutes)
        },
      },
      {
        id: "toggle-density",
        label: densityView
          ? "Show individual vehicles on the map"
          : "Show fleet density on the map",
        group: "View",
        hint: "Buckets the fleet into map cells when markers overlap",
        run: () => {
          close()
          setDensityView(!densityView)
        },
      },
      {
        id: "toggle-follow",
        label: followSelection
          ? "Stop following selected vehicle"
          : "Follow selected vehicle",
        group: "View",
        run: () => {
          close()
          setFollowSelection(!followSelection)
        },
      },
      {
        id: "dispatch-new",
        label: "Dispatch a new delivery",
        group: "Dispatch",
        hint: "Creates an order and puts the nearest idle vehicle on it",
        run: () => {
          close()
          dispatch.dispatchNew()
        },
      },
      {
        id: "undo",
        label: undo.nextLabel ? `Undo: ${undo.nextLabel}` : "Undo last action",
        group: "Dispatch",
        hint: undo.canUndo ? "Ctrl / ⌘ + Z" : "Nothing to undo",
        shortcut: undefined,
        run: () => {
          close()
          undo.undo()
        },
      },
      {
        id: "clear-filters",
        label: "Clear all filters",
        group: "View",
        run: () => {
          close()
          resetFilters()
        },
      },
      {
        id: "shortcuts",
        label: "Show keyboard shortcuts",
        group: "View",
        shortcut: "?",
        run: () => {
          close()
          openPanel("shortcuts")
        },
      },
      {
        id: "replay",
        label: replay.reviewing
          ? "Return to live from review"
          : "Review recent snapshots",
        group: "View",
        shortcut: "P",
        hint: replay.reviewing
          ? "The console is showing historical data"
          : "Pauses the shift and scrubs back through captured moments",
        run: () => {
          close()
          if (replay.reviewing) {
            replay.exit()
          } else {
            replay.enter()
          }
        },
      },
      {
        id: "handover",
        label: "Shift handover report",
        group: "View",
        shortcut: "H",
        hint: "A printable summary of what the next shift inherits",
        run: () => {
          close()
          setHandoverVisible(true)
        },
      },
      {
        id: "briefing",
        label: "Show operations briefing",
        group: "View",
        run: () => {
          close()
          showIntro()
        },
      },
    ]

    for (const scenario of simulation.scenarios) {
      commands.push({
        id: `scenario-${scenario.kind}`,
        label: scenario.label,
        group: "Scenarios",
        hint: scenario.description,
        run: () => {
          close()
          simulation.injectScenario(scenario.kind)
        },
      })
    }

    return commands
  }, [
    densityView,
    dispatch,
    followSelection,
    openPanel,
    resetFilters,
    replay,
    resolvedTheme,
    setCommandPaletteOpen,
    setFollowSelection,
    setDensityView,
    setHandoverVisible,
    setSearchOpen,
    setShowRoutes,
    setTheme,
    setWorkspace,
    showIntro,
    showRoutes,
    simulation,
    undo,
  ])
}
