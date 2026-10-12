# FleetOps Command Center

A real-time logistics operations control centre for a Nigerian delivery network —
520 vehicles, ~680 deliveries, live incident and alert management — built
entirely on the frontend.

There is no backend. A deterministic simulation engine plays the part of the
fleet, and every panel in the interface reacts to the events it publishes.

---

## Contents

- [The product](#the-product)
- [The one thing to look at](#the-one-thing-to-look-at)
- [Running it](#running-it)
- [Architecture](#architecture)
- [The event system](#the-event-system)
- [The simulation engine](#the-simulation-engine)
- [State management](#state-management)
- [Performance](#performance)
- [Loading](#loading)
- [Why no backend is required](#why-no-backend-is-required)
- [Testing](#testing)
- [Project layout](#project-layout)
- [Design decisions worth knowing about](#design-decisions-worth-knowing-about)

---

## The product

FleetOps is the screen a dispatcher watches for a whole shift. It answers one
question continuously:

> If I am responsible for 500 deliveries right now, do I understand what is
> happening, and do I know where to act?

It covers the live map, the delivery board, the driver roster, the corridor
view, the alert queue, incident management, operational analytics and a
simulation console, all on a single non-navigating surface — a dispatcher never
loses the map to a page change.

The operator is an actor on it, not a spectator: deliveries can be reassigned,
re-graded and dispatched by hand, incidents raised from a phone call, zones
drawn around trouble spots, and every reversible action undone with Ctrl+Z.
What is on screen can be exported to CSV, saved as a named view, printed as a
shift handover, or scrubbed back through to see how it looked ten minutes ago.

The operating region is real: Lagos, Ibadan, Abuja, Port Harcourt, Benin City,
Abeokuta, Ilorin, Enugu, Onitsha and Kano, joined by thirteen freight corridors
with real waypoint geometry (Apapa → Ojota → Berger → Mowe → Sagamu → Ogere →
Ibadan, and so on). Vehicles interpolate along those corridors rather than
drifting across the map.

---

## The one thing to look at

The point of the project is that it behaves like **one connected system**, not a
set of screens that happen to share a colour palette. One cause produces a chain
of visible consequences:

```
  Traffic spike on the Lagos–Ibadan corridor
            │
            ▼  corridor speed factor drops to 0.34
  Every vehicle on that corridor slows
            │
            ▼  ETA = now + remaining distance ÷ speed
  Their ETAs move out
            │
            ▼  headroom against the promised time shrinks
  Deliveries cross into AT RISK, then DELAYED
            │
            ├──▶ alerts raised in the alert centre
            ├──▶ lines appear in the activity feed
            ├──▶ timeline entries written on each delivery
            ├──▶ map markers change colour and shape
            ├──▶ KPI cards and their trend arrows move
            └──▶ the analytics charts bend
```

Nothing in that chain is special-cased. It falls out of one rule in
[`lib/calculations.ts`](lib/calculations.ts) — a delivery's status is
derived from its ETA versus its promise — plus the event bus carrying the news.

You can trigger it yourself: `Ctrl/⌘ + K` → **Trigger traffic spike**.

---

## Running it

Requires Node 20.9+ and pnpm.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Everything else:

```bash
pnpm build          # production build
pnpm typecheck      # tsc --noEmit, strict
pnpm lint           # eslint
pnpm test           # unit + UI tests (vitest)
pnpm test:coverage  # with coverage thresholds
pnpm test:e2e       # Playwright, against a production build
```

The map uses Mapbox GL JS, which needs an access token:

```bash
cp .env.example .env.local   # then set NEXT_PUBLIC_MAPBOX_TOKEN
```

A free Mapbox account covers the volume a demo generates. Without a token the
app still runs: the map falls back to an empty basemap with a coordinate
graticule, and panning, zooming, the corridor overlay and the whole fleet keep
working. The same fallback catches a rejected token or unreachable tiles, so a
basemap outage never takes vehicle tracking with it.

Mapbox GL renders through WebGL. Where WebGL is unavailable the map surface says
so and the fleet stays readable through the overview panel and the board.

---

## Architecture

The codebase is two layers with a one-way dependency between them.

```
┌─────────────────────────────── BUSINESS LAYER ───────────────────────────────┐
│                                                                              │
│   SIMULATION ENGINE          deterministic world: kinematics, traffic,       │
│   services/simulation/       dispatch, incidents, alerts                     │
│            │                                                                 │
│            │ emit(name, payload)                                             │
│            ▼                                                                 │
│   EVENT BUS                  typed in-memory pub/sub; the only coupling      │
│   services/event-bus/        between the engine and anything else            │
│            │                                                                 │
│            │ subscribe                                                       │
│            ▼                                                                 │
│   EVENT WIRING               the single place where events become state,     │
│   stores/event-wiring.ts     batched into one commit per flush               │
│            │                                                                 │
│            ▼                                                                 │
│   STORES                     vehicle · delivery · alert · incident ·         │
│   stores/                    activity · metrics · reference · simulation · ui│
│            │                                                                 │
│            ▼                                                                 │
│   HOOKS                      useFleet · useDeliveries · useDeliveryBoard ·   │
│   hooks/                     useAlerts · useIncidents · useSimulation ·      │
│                              useMap · useSearch · useMetrics · useActivity   │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │  finished data + callbacks
┌──────────────────────────────────▼─────────── PRESENTATION LAYER ────────────┐
│                                                                              │
│   OperationsControlCenter  ·  layout and wiring only                         │
│        ├── OperationsHeader      ├── OperationsSidebar                       │
│        ├── Workspace             │     ├── MetricsGrid / KpiCard             │
│        │     ├── OperationsMap   │     ├── Meter                             │
│        │     ├── DeliveryBoard   │     ├── Filter controls                   │
│        │     └── AnalyticsView   │     └── VehicleList                       │
│        ├── VehicleDetails        ├── SidePanel                               │
│        ├── DeliveryDetails       │     ├── AlertPanel                        │
│        ├── ActivityFeed          │     ├── IncidentPanel                     │
│        ├── CommandPalette        │     ├── SimulationPanel                   │
│        └── GlobalSearch          │     └── ShortcutsPanel                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**The rule the codebase enforces:** no file under `components/` imports the
simulation engine, the event bus, the mock data generator or a storage API. A
component receives data and callbacks; it does not know how a delay is
calculated or that a simulation exists. You could delete the entire
presentation layer and the operations engine would still run, fully tested.

Components do read from stores through hooks — but only through hooks, and the
hooks are where the business logic lives:

```tsx
// What a component looks like
function VehiclePanel() {
  const { selectedVehicle, clearSelection } = useFleet()
  return <VehicleDetails detail={selectedVehicle} onClose={clearSelection} />
}
```

**Each region subscribes for itself.** There is no single `useOperations()`
object threaded through the tree. The sidebar reads the fleet and the metrics,
the alert panel reads alerts, the map reads the map — so a vehicle moving does
not re-render the header, and an acknowledged alert does not re-render the map.
An earlier revision did pass one composed object everywhere; it re-rendered the
entire console on every simulation commit, roughly eight times a second. See
[Performance](#performance).

### Hook responsibilities

| Hook | Owns |
| --- | --- |
| `useFleet` | vehicle state, filtering, pagination, selection, detail composition |
| `useDeliveries` | the board, filtering, sorting, pagination, lifecycle commands |
| `useAlerts` | prioritisation, severity filtering, acknowledge/dismiss/resolve |
| `useIncidents` | incident lifecycle, assignment, allowed transitions |
| `useSimulation` | start/pause/reset, event rate, scenario toggles, manual injection |
| `useMetrics` | KPI set, trends against the shift baseline, chart series |
| `useSearch` | debounced global search across five entity types |
| `useMap` | route overlay, filter predicate, camera focus, telemetry access |
| `useActivity` | the live feed, severity filtering, hold-to-read |
| `useDeliveryBoard` | the table projection: filter, join, sort, paginate, bulk actions |
| `useDrivers` | driver records, resolved to their vehicle and workload |
| `useDriverRoster` | the roster projection: workload per driver, filter, sort, paginate |
| `useRoutes` | corridor load, congestion and late work per route |
| `useDispatch` | reassign, re-grade, dispatch and cancel — with undo and receipts |
| `useUndo` | the operator action journal, and why a reversal was refused |
| `useSavedViews` | named filter presets, persisted locally |
| `useExport` | what each dataset contains, respecting the current filters |
| `useFuel` | the refuelling worklist, ranked by who will strand |
| `useAnalytics` | the time window and the region / corridor breakdown |
| `useAlertSettings` | the thresholds that define late, at risk, accurate and low |
| `useGeofences` | zone definition, placement and enter/exit/dwell triggers |
| `useReplay` | review mode: keyframe capture, scrubbing, return to live |
| `useHandover` | the point-in-time shift report |
| `useAlertNotifications` | opt-in escalation via sound and OS notification |
| `useOperationsWorkspace` | which tab and side panel are open |
| `useOperationsFilters` | the shared status / region / query filter surface |

---

## The event system

Every operational fact in the app is a typed event. The catalogue lives in
[`types/events.ts`](types/events.ts) and is the contract between the
engine and everything downstream:

```
vehicle.location.updated   delivery.created        traffic.normal
vehicle.speed.changed      delivery.assigned       traffic.slow
vehicle.status.changed     delivery.started        traffic.spike.detected
vehicle.stopped            delivery.progress.updated   traffic.cleared
vehicle.offline            delivery.eta.revised
vehicle.online             delivery.delayed        incident.created
vehicle.fuel.low           delivery.at_risk        incident.acknowledged
                           delivery.recovered      incident.investigating
alert.raised               delivery.completed      incident.resolved
alert.acknowledged         delivery.cancelled      incident.assigned
alert.dismissed            delivery.timeline.appended
alert.resolved                                     simulation.started / paused
                                                   simulation.reset / tick / error
```

The bus itself ([`services/event-bus/event-bus.ts`](services/event-bus/event-bus.ts))
is about 150 lines and dependency free. Three properties matter:

- **Typed end to end.** `bus.on("delivery.delayed", e => e.payload.delayMinutes)`
  type-checks; a wrong payload is a compile error.
- **Handler isolation.** A subscriber that throws is caught, reported through
  `onError`, and the remaining subscribers still run. One broken panel cannot
  take down the stream.
- **Safe re-entrancy.** Handler sets are copied before dispatch, so subscribing
  or unsubscribing from inside a handler cannot corrupt the current emit.

**Commands versus events.** User actions do not mutate stores directly. They go
to the engine as commands (`acknowledgeAlert`, `resolveIncident`,
`completeDeliveryNow`), the engine applies them and emits the resulting events,
and the stores project those exactly as they project simulated ones. The engine
stays the single writer, so the two views of the world cannot drift apart — and
an operator's action shows up in the activity feed just like a simulated one.

---

## The simulation engine

The engine owns a `World`: the fleet, the board, corridor traffic, incidents,
alerts, and per-vehicle kinematics. It runs two independent cadences.

**Movement** (every second) integrates position. Distance along the route is the
authoritative quantity; coordinates, heading, ETA and delivery status are all
derived from it. That is why vehicles follow the road rather than drifting, and
why the map, the panels and the metrics cannot disagree.

**Operational events** (every 5s / 2s / 3-per-400ms, by rate) draw a weighted
scenario from the enabled toggles and run it: a traffic escalation, a vehicle
stop, a breakdown, a new dispatch, a completion, or a recovery step.

### The operations clock

The console runs on a **×90 time-lapse**: one real second advances the world by
ninety simulated seconds, so a 240 km Lagos–Ibadan run completes in about two
minutes while ETAs, delays and durations stay in honest units.

Every timestamp in the app — ETAs, alert ages, activity-feed lines, the header
clock — is read from one shared clock
([`services/simulation/ops-clock.ts`](services/simulation/ops-clock.ts)).
Mixing `Date.now()` with simulated time would be a real bug: an ETA stamped on
the simulated clock and compared against a real-clock "now" drifts further apart
every second the session runs.

Pausing freezes the clock, so a paused world does not silently accrue delay.

### Determinism

Generation is seeded (mulberry32), so the same seed always produces the same
520 vehicles, the same board, the same incidents. That is what makes **Reset
simulation** mean what it says — it regenerates the identical opening dataset,
not merely a similar one — and it is what makes the engine testable without
stubbing `Math.random`.

A bug caught by the test suite: timeline entry ids originally came from a module
counter, which made the generated dataset depend on how much had already been
generated in the process. Ids are now derived from their own content.

---

## State management

Nine focused stores rather than one global object:

| Store | Holds |
| --- | --- |
| `referenceStore` | routes, drivers, customers, corridor traffic — low churn |
| `vehicleStore` | vehicles by id + fleet counts |
| `deliveryStore` | deliveries by id + counts + performance aggregates |
| `alertStore` | the prioritised alert queue |
| `incidentStore` | incidents and their logs |
| `activityStore` | a capped ring of feed lines |
| `metricsStore` | the rolling chart series and the shift baseline |
| `simulationStore` | bootstrap phase, engine status, config |
| `uiStore` | selection, filters, panels, table state, preferences |

The split is deliberate: a component reading a driver's name must not re-render
because a truck moved 400 metres. Reference data and high-churn telemetry live
in different stores for exactly that reason.

Three kinds of state are kept apart, as the brief asks:

- **Server-like state** — the operational dataset, fetched through TanStack
  Query from a mock gateway with real async, loading, error and retry handling.
- **Client state** — selection, filters, open panels, table layout, theme.
- **Simulation state** — running status, event rate, scenario probabilities.

**Aggregates are computed on commit, not in selectors.** Eight KPI cards each
walking 680 deliveries on every batch would be eight full passes; instead the
store computes counts and performance once per commit and the cards read the
result.

---

## Performance

The app simulates 520 vehicles and emits hundreds of events per second in fast
mode. Four techniques carry that load.

**1. The map never touches React.** Vehicle positions are written to a
[telemetry buffer](services/simulation/telemetry.ts) — a plain `Map`
outside React — and a single `requestAnimationFrame` loop draws all 500 markers
to one `<canvas>`. Moving a truck costs zero reconciliations. The canvas layer
mounts once and never re-renders; filters and selection are mirrored into refs
so changing them does not restart the loop.

**2. Allocation-free projection.** `latLngToContainerPoint` allocates a `Point`
per call — 30,000 objects a second at 500 vehicles × 60fps, which shows up as GC
sawtooth. The hot path computes spherical Mercator
[directly into primitives](lib/map/projection.ts), and the hit-test
index is a pair of `Float32Array`s rather than an array of objects.

**3. Event batching.** The wiring layer coalesces vehicle patches, delivery
patches and activity lines into one store commit per 120 ms, merging repeat
patches for the same entity. Twenty position events become one commit — there is
a test that asserts exactly that.

**4. Bounded lists and filter predicates.** The activity feed is virtualised —
it is unbounded and append-heavy, so cost has to be bounded by the viewport.
The fleet rail and the delivery board are paginated instead, which bounds them
just as effectively without a measurement dependency: a page of fifty rows is
nothing for the DOM. The
map's filter is exposed as a *predicate* rather than a filtered array: changing a
filter costs one memo recomputation instead of re-rendering 500 markers.

**5. Scoped subscriptions.** Every region subscribes to the narrowest slice it
needs, and panels that are closed are unmounted rather than hidden — a closed
detail panel costs nothing at all. The two heaviest derivations are scoped to
the screens that use them: the delivery table projection (filter + four joins +
sort over ~680 rows) runs only while the board is open, and the global search
index (~1,700 records) is built only while the search dialog is open.

**6. Code splitting.** The first paint is the header, the overview rail, the
map and the activity feed — and nothing else. The delivery board, the analytics
charts (and with them the entire charting library), the three detail panels,
the side panels and both dialogs are reachable only by an explicit action, so
their code is fetched when that action happens. Measured on the production
build: **1,360 kB → 920 kB of JavaScript on first load, a 32% reduction**, with
the deferred 435 kB arriving only on demand.

**7. Frame skipping.** The canvas loop compares a telemetry version counter and
a viewport signature against the previous frame and returns early when neither
has changed. Because positions are interpolated between integration ticks, a
frame is only ever redundant once that interpolation has finished — which, with
the simulation paused, means the map stops drawing entirely.

### Measured

First-load JavaScript, production build, every byte the browser fetches before
the console is interactive:

| | First load | Fetched on demand |
| --- | --- | --- |
| Before code splitting | 1,360 kB | — |
| After | **920 kB** | 435 kB |

Chrome DevTools Protocol metrics, production build, 500+ vehicles at the "fast"
event rate, 20-second window:

| | Script time | Main thread busy |
| --- | --- | --- |
| Before the audit | 5.75 s | 59% |
| After | 1.79 s | 40% |
| After, paused | 0.05 s | 2% |

The remaining 40% is the canvas render loop and Mapbox GL — the cost of actually
drawing 500 moving vehicles at display refresh rate, which is the job.

Smaller things that matter: interpolation between 1 Hz integration ticks gives
smooth motion without a faster tick; the scheduler clamps elapsed deltas so a
backgrounded tab cannot replay ten minutes in one step and teleport the fleet;
the simulation pauses when the tab is hidden; and all three workspace views stay
mounted so switching tabs does not reload the basemap.

---

## Loading

The gateway is paginated, because a real one would be. The reference payload —
the road network, the roster, and the collection totals — arrives first, then
vehicles and deliveries are paged concurrently through `useInfiniteQuery`, then
the operational overlay.

```
reference ──▶ totals known, progress becomes a real fraction
     │
     ├──▶ vehicles    120 at a time  ─┐
     ├──▶ deliveries  120 at a time  ─┼──▶ one snapshot ──▶ stores ──▶ engine
     └──▶ incidents, alerts, activity ┘
```

**The stores are written once, when every page has landed.** Streaming partial
collections into them would be easy and wrong: the KPI cards and the fleet
counters are aggregates, and an aggregate over half a dataset is not a smaller
truth, it is a false one. The operator watches a progress bar reporting real
record counts — "480 / 520 vehicles" — and then sees a complete board. Never a
board that is quietly incorrect.

The whole initial view appears together for the same reason. There is no
staggered reveal of a shell that fills in afterwards.

---

## Why no backend is required

The brief is a *frontend* engineering problem: complex UI state, real-time
propagation, dense information design, and performance at scale. A backend would
add deployment surface without adding any of that.

What a backend would normally provide is modelled explicitly instead:

| Backend concern | How it is handled here |
| --- | --- |
| Data source | Seeded deterministic generator (`services/mock/`) |
| API boundary | `operationsApi` — cursor pagination, latency, failure injection, `AbortSignal` |
| Server state | TanStack Query — `useInfiniteQuery` paging, genuine loading, error and retry |
| Push updates | Event bus, with the same shape a WebSocket feed would have |
| Write path | Engine commands, the CQRS half of the same loop |
| Persistence | `localStorage`, validated on read and degrading safely |

The seam is honest: swapping the mock API for HTTP and the engine for a
WebSocket would touch `services/`, and nothing above it. The stores already
consume an event stream; they do not care who produces it.

---

## Testing

```
240 unit and UI tests  ·  29 end-to-end tests
```

```bash
pnpm test           # vitest: unit + UI
pnpm test:coverage  # with 70% thresholds on the business layer
pnpm test:e2e       # Playwright, against a production build
```

**Unit tests** cover the business layer, which is deliberately testable without
rendering anything:

- *Event bus* — subscription, emission, multi-name and wildcard subscribers,
  `once`, cleanup, handler isolation, re-entrant unsubscribe.
- *Calculations* — traffic factors, ETA arithmetic, the delivery state machine
  at each threshold, vehicle status derivation, every aggregate.
- *Routing* — corridor geometry, leg offsets, progress resolution and clamping,
  plus the seeded RNG's determinism and weighting.
- *Simulation* — lifecycle, clock advance, movement integration, each scenario
  generator, the incident lifecycle including rejected transitions, reset
  fidelity, error handling, and scheduler drift clamping.
- *Stores and wiring* — projection of events onto state, batching, activity
  message generation, alert persistence, Escape-key layering.
- *Search and filtering* — ranking, grouping, every filter dimension, sorting
  and pagination edge cases.

**UI tests** (Testing Library) check behaviour and accessibility rather than
markup: `aria-sort` on the sorted column, the selected option reported to
assistive tech, keyboard activation, the live region switching off when the feed
is held, and every empty state offering a way out.

Four of the end-to-end tests are **regression tests from the engineering
audit**: panning the map must not clear the selection, the zoom control must
not clear it either, clicking empty map must still clear it, and the activity
log must not be an auto-announcing live region. Each was a real defect found by
driving the built application.

**End-to-end tests** (Playwright, production build) cover the journeys a
reviewer will take: boot, live streaming, the traffic-spike propagation chain,
vehicle selection and follow, board sorting and filtering, global search, alert
acknowledgement, the incident lifecycle, pause/resume/reset — including that
reset restores exactly 247 in transit — analytics rendering, preference
persistence across reload, and keyboard navigation with landmark roles. Any
uncaught page error fails the run.

---

## Project layout

A single Next.js application — no workspaces, no build orchestrator, one
`package.json`.

```
├── app/                  App Router entry, design tokens, console styles
├── components/           presentation only — no business logic
│   ├── activity/  alerts/  analytics/  dashboard/  deliveries/
│   ├── drivers/  export/  fleet/  geofence/  handover/  incidents/
│   ├── intro/  map/  providers/  replay/  routes/  search/  settings/
│   ├── shared/  shell/  simulation/  vehicles/  views/
│   └── ui/               shadcn primitives (Base UI): button, dialog, switch
├── hooks/                the business-logic surface the UI consumes
├── lib/                  pure domain logic: geo, routing, calculations,
│                         filtering, search, timeline, status tokens, map maths
├── services/
│   ├── event-bus/        typed pub/sub + batching
│   ├── mock/             seeded dataset generator + mock gateway
│   ├── simulation/       engine, world, movement, generators, scheduler,
│   │                     telemetry buffer, operations clock
│   │   └── operations/   domain operations: deliveries, vehicles, traffic,
│   │                     dispatch, assignment, geofencing, alerts, incidents
│   ├── export/           the single place a file leaves the browser
│   └── storage/          validated localStorage preferences, saved views, zones
├── stores/               Zustand stores + the event→state wiring
├── types/                the domain vocabulary
├── data/                 Nigerian geography, name pools, tuning constants
└── tests/                unit/ · ui/ · e2e/
```

---

## Design decisions worth knowing about

**Status is never colour alone.** Every status token carries a hue, a glyph
(`▲ ■ ◆ ▼ ✕ ✓`) and a three-letter code, used consistently by badges, the map
canvas and the legend. The map's key shows the same glyphs the canvas draws, so
the screen survives greyscale and colour-vision deficiency.

**Empty states carry meaning.** "No alerts" is good news and is styled as such;
"no deliveries match" is a dead end and ships with a *Clear filters* button.
They are not the same grey box.

**Escalation is opt-in.** Critical alerts can also reach the operator through
a Web Audio tone and an OS notification, but both default to off and the
permission prompt is only raised when the switch is actually turned on. A
console that makes noise on load, or asks for notification rights before anyone
has expressed interest, trains people to refuse both. Notifications fire only
while the console is in a background tab — if the alert centre is on screen, an
OS popup is duplicate noise.

**Paginated lists reveal the selection.** A vehicle is chosen from the map, a
search hit or an alert at least as often as from the fleet rail, and with the
rail paginated that choice would otherwise land on a page the operator cannot
see. Selecting a vehicle anywhere jumps the rail to the page holding it —
keyed on the selection changing, not on the page, so paging away by hand is
never undone.

**The overview rail has two scroll regions, not one.** Paging the fleet used to
scroll the KPI cards off the top, because the browser brings the focused pager
into view and the pager sat at the bottom of one very tall column. The summary
sections now scroll independently and the fleet pager is pinned to the bottom
of the rail.

**Bulk actions say what they will do.** Selecting a page of deliveries may
include ones that are already closed, so the action bar reports the actionable
subset separately and the buttons name that count. A button that silently does
less than it says is worse than a disabled one.

**Detail panels are not modal.** A dispatcher inspecting a vehicle must still be
able to watch the map and the alert queue. On desktop the vehicle panel, the
delivery panel and the side panel are flex siblings, so none can obscure
another; on tablet they become full-screen sheets, because there is no room for
both.

**One keyboard owner.** Shortcuts and the command palette are generated from a
single command registry, so a binding and its palette entry cannot drift apart.
Single-letter shortcuts are suppressed while a text field has focus.

**The map is isolated.** Its controls and canvas overlay carry their own
z-indexes, which would otherwise compete with application dialogs. The map
container creates a stacking context (`isolate`) to contain them — a one-word
fix for a bug that otherwise makes every modal unclickable.

**The basemap is 2D on purpose.** Rotation and pitch are disabled. The fleet is
painted on a canvas overlay projected from the camera's centre and zoom, which
only lines up with the basemap while bearing and pitch are zero — and a tilted
map is the wrong instrument for reading a national fleet at a glance. Dark mode
is Mapbox's own dark style rather than a filter over the light one.
