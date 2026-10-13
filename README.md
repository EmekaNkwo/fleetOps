# FleetOps Command Center

A real-time logistics control centre for a Nigerian delivery network — 520
vehicles, ~680 deliveries, live incident and alert management — built entirely
on the frontend. There is no backend: a deterministic simulation engine plays
the part of the fleet, and every panel reacts to the events it publishes.

It is the screen a dispatcher watches for a whole shift, answering one question
continuously: *if I am responsible for 500 deliveries right now, do I understand
what is happening, and do I know where to act?* Map, delivery board, roster,
corridors, alerts, incidents, analytics and a simulation console all live on one
non-navigating surface — a dispatcher never loses the map to a page change.

The operator is an actor, not a spectator: deliveries can be reassigned,
re-graded and dispatched by hand, incidents raised, zones drawn, and every
reversible action undone with Ctrl+Z. What is on screen can be exported to CSV,
saved as a named view, printed as a shift handover, or scrubbed back ten minutes.

The region is real — Lagos, Ibadan, Abuja, Port Harcourt, Benin City, Abeokuta,
Ilorin, Enugu, Onitsha, Kano — joined by thirteen freight corridors with real
waypoint geometry. Vehicles interpolate along those corridors rather than
drifting across the map.

---

## One connected system

The point of the project is that it behaves like one system, not a set of
screens sharing a colour palette. One cause produces a chain of consequences:

```
Traffic spike on the Lagos–Ibadan corridor
  └─▶ corridor speed factor drops to 0.34 — every vehicle on it slows
      └─▶ ETA = now + remaining distance ÷ speed, so ETAs move out
          └─▶ headroom against the promised time shrinks
              └─▶ deliveries cross into AT RISK, then DELAYED
                  ├─▶ alerts raised · activity lines written
                  ├─▶ delivery timelines appended
                  ├─▶ map markers change colour and shape
                  └─▶ KPI trends and analytics charts bend
```

Nothing in that chain is special-cased. It falls out of one rule in
[`lib/calculations.ts`](lib/calculations.ts) — status is derived from ETA versus
promise — plus the event bus carrying the news. Trigger it yourself with
`Ctrl/⌘ + K` → **Trigger traffic spike**.

---

## Running it

Node 20.9+ and pnpm.

```bash
pnpm install
pnpm dev            # http://localhost:3000

pnpm build          # production build
pnpm typecheck      # tsc --noEmit, strict
pnpm lint           # eslint
pnpm test           # unit + UI (vitest)
pnpm test:coverage  # 70% thresholds on the business layer
pnpm test:e2e       # Playwright, against a production build
```

The map uses Mapbox GL JS, which needs a token:

```bash
cp .env.example .env.local   # then set NEXT_PUBLIC_MAPBOX_TOKEN
```

A free account covers a demo's volume. Without a token the app still runs: the
basemap falls back to a coordinate graticule while panning, zooming, corridors
and the whole fleet keep working. The same fallback catches a rejected token or
unreachable tiles, so a basemap outage never takes vehicle tracking with it.
Mapbox renders through WebGL; where that is unavailable the map says so and the
fleet stays readable through the overview rail and the board.

---

## Architecture

Two layers, one-way dependency.

```
BUSINESS LAYER
  services/simulation/   deterministic world: kinematics, traffic, dispatch,
                         incidents, alerts
          │ emit(name, payload)
  services/event-bus/    typed in-memory pub/sub — the only coupling between
          │              the engine and anything else
  stores/event-wiring.ts the single place events become state, batched into
          │              one commit per flush
  stores/                vehicle · delivery · alert · incident · activity ·
          │              metrics · reference · simulation · ui
  hooks/                 the business surface the UI consumes
          │
          ▼  finished data + callbacks
PRESENTATION LAYER
  components/            layout and rendering only
```

**The rule the codebase enforces:** no file under `components/` imports the
simulation engine, the event bus, the mock generator or a storage API. A
component receives data and callbacks; it does not know how a delay is
calculated or that a simulation exists. Delete the entire presentation layer and
the operations engine still runs, fully tested.

```tsx
function VehiclePanel() {
  const { selectedVehicle, clearSelection } = useFleet()
  return <VehicleDetails detail={selectedVehicle} onClose={clearSelection} />
}
```

**Each region subscribes for itself.** There is no composed `useOperations()`
threaded through the tree, so a moving truck does not re-render the header and
an acknowledged alert does not re-render the map. An earlier revision did pass
one object everywhere and re-rendered the whole console eight times a second.

Roughly thirty hooks own the business surface — `useFleet`, `useDeliveryBoard`,
`useAlerts`, `useIncidents`, `useMap`, `useDispatch`, `useReplay`, `useUndo` and
so on — each owning one projection and its commands.

---

## Events and commands

Every operational fact is a typed event; the catalogue in
[`types/events.ts`](types/events.ts) is the contract between the engine and
everything downstream (`vehicle.location.updated`, `delivery.at_risk`,
`traffic.spike.detected`, `incident.resolved`, …). The bus itself is ~150 lines
and dependency free:

- **Typed end to end** — `bus.on("delivery.delayed", e => e.payload.delayMinutes)`
  type-checks; a wrong payload is a compile error.
- **Handler isolation** — a subscriber that throws is reported through `onError`
  and the rest still run. One broken panel cannot take down the stream.
- **Safe re-entrancy** — handler sets are copied before dispatch, so
  (un)subscribing inside a handler cannot corrupt the current emit.

**Commands versus events.** User actions never mutate stores. They reach the
engine as commands (`acknowledgeAlert`, `resolveIncident`), which applies them
and emits the resulting events; the stores project those exactly as they project
simulated ones. The engine stays the single writer, so the two views of the
world cannot drift — and an operator's action appears in the activity feed just
like a simulated one.

---

## The simulation engine

The engine owns a `World` and runs two cadences. **Movement** (1 Hz) integrates
distance along the route as the authoritative quantity — coordinates, heading,
ETA and status are all derived from it, which is why vehicles follow the road
and why the map, panels and metrics cannot disagree. **Operational events**
(5s / 2s / 3-per-400ms, by rate) draw a weighted scenario: a traffic
escalation, a stop, a breakdown, a dispatch, a completion, a recovery.

**The clock.** A ×90 time-lapse — one real second advances the world ninety —
so a 240 km Lagos–Ibadan run finishes in about two minutes while ETAs and delays
stay in honest units. Every timestamp reads from one shared clock
([`ops-clock.ts`](services/simulation/ops-clock.ts)); mixing `Date.now()` with
simulated time would drift further apart every second. Pausing freezes it, so a
paused world accrues no delay.

**Determinism.** Generation is seeded (mulberry32), so the same seed always
produces the same 520 vehicles and the same board. That is what makes *Reset
simulation* mean what it says, and what makes the engine testable without
stubbing `Math.random`. One bug this caught: timeline ids came from a module
counter, making the dataset depend on how much had already been generated; they
are now derived from their own content.

---

## State

Nine focused stores rather than one global object — `reference`, `vehicle`,
`delivery`, `alert`, `incident`, `activity`, `metrics`, `simulation`, `ui`. The
split is deliberate: a component reading a driver's name must not re-render
because a truck moved 400 metres, so reference data and high-churn telemetry
live apart.

Three kinds of state are kept separate: **server-like** (the dataset, fetched
through TanStack Query from a mock gateway with real async, loading, error and
retry), **client** (selection, filters, panels, theme) and **simulation**
(status, rate, scenario probabilities).

**Aggregates are computed on commit, not in selectors.** Eight KPI cards each
walking 680 deliveries per batch would be eight full passes; the store computes
counts and performance once per commit and the cards read the result.

---

## Performance

520 vehicles and hundreds of events per second in fast mode. What carries it:

1. **The map never touches React.** Positions are written to a
   [telemetry buffer](services/simulation/telemetry.ts) outside React, and one
   `requestAnimationFrame` loop draws all 500 markers to a `<canvas>`. Moving a
   truck costs zero reconciliations; filters and selection are mirrored into
   refs so changing them does not restart the loop.
2. **Allocation-free projection.** Mapbox's `map.project()` allocates per call —
   30,000 objects a second at 500 vehicles × 60fps, visible as GC sawtooth. The
   hot path computes spherical Mercator
   [directly into primitives](lib/map/projection.ts), and the hit-test index is
   a pair of `Float32Array`s rather than an array of objects.
3. **Event batching.** The wiring layer coalesces patches into one commit per
   120 ms, merging repeats for the same entity. Twenty position events become
   one commit — there is a test asserting exactly that.
4. **Bounded lists, filter predicates.** The activity feed is virtualised
   (unbounded, append-heavy); the fleet rail and board are paginated instead,
   which bounds them without a measurement dependency. The map's filter is a
   *predicate*, so changing it costs one memo rather than 500 re-renders.
5. **Scoped subscriptions.** Closed panels are unmounted, not hidden. The two
   heaviest derivations — the delivery table projection and the ~1,700-record
   search index — are built only while their screen is open.
6. **Code splitting.** First paint is the header, overview rail, map and feed.
   The board, the charts (and the charting library), the detail panels, side
   panels and dialogs load on the action that needs them.
7. **Frame skipping.** The canvas loop compares a telemetry version and a
   viewport signature against the last frame and returns early when neither
   changed — with the simulation paused, the map stops drawing entirely.

First-load JavaScript, production build:

| | First load | Fetched on demand |
| --- | --- | --- |
| Before code splitting | 1,360 kB | — |
| After | **920 kB** | 435 kB |

Chrome DevTools Protocol, production build, 500+ vehicles at the fast event
rate, 20-second window:

| | Script time | Main thread busy |
| --- | --- | --- |
| Before the audit | 5.75 s | 59% |
| After | 1.79 s | 40% |
| After, paused | 0.05 s | 2% |

The remaining 40% is the canvas loop and Mapbox GL — the cost of drawing 500
moving vehicles at refresh rate, which is the job.

Smaller things that matter: interpolation between 1 Hz ticks gives smooth motion
without a faster tick; the scheduler clamps elapsed deltas so a backgrounded tab
cannot replay ten minutes in one step; the simulation pauses when the tab is
hidden; and all three workspace views stay mounted so switching tabs does not
reload the basemap.

---

## Loading

The gateway is paginated, because a real one would be. Reference data arrives
first (making progress a real fraction), then vehicles and deliveries page
concurrently through `useInfiniteQuery`, then the operational overlay.

**The stores are written once, when every page has landed.** Streaming partial
collections in would be easy and wrong: KPI cards and fleet counters are
aggregates, and an aggregate over half a dataset is not a smaller truth, it is a
false one. The operator watches real record counts — "480 / 520 vehicles" — then
sees a complete board, never a quietly incorrect one.

---

## Why there is no backend

The brief is a *frontend* problem: complex UI state, real-time propagation,
dense information design, performance at scale. A backend would add deployment
surface without adding any of that. What one would normally provide is modelled
explicitly instead:

| Backend concern | Here |
| --- | --- |
| Data source | Seeded deterministic generator (`services/mock/`) |
| API boundary | `operationsApi` — cursor pagination, latency, failure injection, `AbortSignal` |
| Server state | TanStack Query — paging, genuine loading, error and retry |
| Push updates | Event bus, shaped like a WebSocket feed |
| Write path | Engine commands — the CQRS half of the same loop |
| Persistence | `localStorage`, validated on read, degrading safely |

The seam is honest: swapping the mock API for HTTP and the engine for a
WebSocket would touch `services/` and nothing above it.

---

## Testing

```
271 unit and UI tests  ·  38 end-to-end tests
```

**Unit tests** cover the business layer, which is testable without rendering:
the event bus (isolation, re-entrancy, wildcards), calculations (traffic
factors, ETA arithmetic, every status threshold), routing and the seeded RNG,
the simulation lifecycle and scenario generators, store projection and batching,
map projection and geofence geometry, and search, filtering and pagination
edges.

**UI tests** (Testing Library) check behaviour and accessibility rather than
markup — `aria-sort` on the sorted column, the selected option reported to
assistive tech, the live region switching off when the feed is held.

**End-to-end tests** (Playwright, production build) cover the journeys a
reviewer will take: boot, live streaming, the traffic-spike chain, selection and
follow, board sorting, global search, alert acknowledgement, the incident
lifecycle, pause/resume/reset — including that reset restores exactly 247 in
transit — analytics, preference persistence and keyboard navigation. Any
uncaught page error fails the run.

Several are regressions from the engineering audit, each a real defect found by
driving the built app: panning must not clear the selection, nor must the zoom
control; clicking empty map must still clear it; the activity log must not
auto-announce; and the fleet canvas must draw where the camera is pointed.

---

## Layout

A single Next.js application — no workspaces, no build orchestrator.

```
├── app/          App Router entry, design tokens, console styles
├── components/   presentation only — no business logic (ui/ holds shadcn primitives)
├── hooks/        the business-logic surface the UI consumes
├── lib/          pure domain logic: geo, routing, calculations, filtering,
│                 search, status tokens, map maths
├── services/
│   ├── event-bus/   typed pub/sub + batching
│   ├── mock/        seeded dataset generator + mock gateway
│   ├── simulation/  engine, world, movement, generators, scheduler, telemetry,
│   │                operations clock, and operations/ domain commands
│   ├── export/      the single place a file leaves the browser
│   └── storage/     validated localStorage preferences, views, zones
├── stores/       Zustand stores + the event→state wiring
├── types/        the domain vocabulary
├── data/         Nigerian geography, name pools, tuning constants
└── tests/        unit/ · ui/ · e2e/
```

---

## Decisions worth knowing about

**Status is never colour alone.** Every token carries a hue, a glyph
(`▲ ■ ◆ ▼ ✕ ✓`) and a three-letter code, used by badges, the map canvas and the
legend alike, so the screen survives greyscale and colour-vision deficiency.

**Empty states carry meaning.** "No alerts" is good news and is styled as such;
"no deliveries match" is a dead end and ships with a *Clear filters* button.

**Escalation is opt-in.** Critical alerts can reach the operator by tone and OS
notification, but both default to off and the permission prompt is raised only
when the switch is turned on. A console that makes noise on load trains people
to refuse both. Notifications fire only in a background tab.

**Paginated lists reveal the selection.** A vehicle is chosen from the map, a
search hit or an alert as often as from the rail, so selecting one anywhere
jumps the rail to its page — keyed on the selection changing, so paging by hand
is never undone.

**Bulk actions say what they will do.** A selected page may include closed
deliveries, so the action bar reports the actionable subset and the buttons name
that count. A button that silently does less than it says is worse than a
disabled one.

**Detail panels are not modal.** A dispatcher inspecting a vehicle must still
watch the map and the alert queue, so the panels are flex siblings on desktop;
on tablet they become sheets, because there is no room for both.

**The basemap is 2D on purpose.** Rotation and pitch are disabled: the fleet is
painted on a canvas overlay projected from the camera's centre and zoom, which
only lines up while bearing and pitch are zero — and a tilted map is the wrong
instrument for reading a national fleet. Dark mode is Mapbox's own dark style
rather than a filter over the light one. The map container also creates a
stacking context (`isolate`), without which its controls paint over every
dialog.
