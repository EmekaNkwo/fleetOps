import type { BoundingBox, Corridor, Region, RegionId, Waypoint } from "@/types"

/**
 * Operating regions. Coordinates are approximate city centres; they only need
 * to be good enough to place vehicles believably on a real basemap.
 */
export const REGIONS: readonly Region[] = [
  { id: "lagos", name: "Lagos", state: "Lagos", center: { lat: 6.4541, lng: 3.3947 } },
  { id: "ibadan", name: "Ibadan", state: "Oyo", center: { lat: 7.3775, lng: 3.947 } },
  { id: "abuja", name: "Abuja", state: "FCT", center: { lat: 9.0765, lng: 7.3986 } },
  {
    id: "port-harcourt",
    name: "Port Harcourt",
    state: "Rivers",
    center: { lat: 4.8156, lng: 7.0498 },
  },
  {
    id: "benin-city",
    name: "Benin City",
    state: "Edo",
    center: { lat: 6.335, lng: 5.6037 },
  },
  { id: "abeokuta", name: "Abeokuta", state: "Ogun", center: { lat: 7.1557, lng: 3.3451 } },
  { id: "ilorin", name: "Ilorin", state: "Kwara", center: { lat: 8.4966, lng: 4.5421 } },
  { id: "enugu", name: "Enugu", state: "Enugu", center: { lat: 6.4402, lng: 7.4943 } },
  { id: "onitsha", name: "Onitsha", state: "Anambra", center: { lat: 6.1414, lng: 6.8022 } },
  { id: "kano", name: "Kano", state: "Kano", center: { lat: 12.0022, lng: 8.592 } },
]

export const REGION_BY_ID: Readonly<Record<RegionId, Region>> = Object.freeze(
  Object.fromEntries(REGIONS.map((region) => [region.id, region])) as Record<
    RegionId,
    Region
  >
)

export const NIGERIA_BOUNDS: BoundingBox = {
  south: 4.2,
  west: 2.7,
  north: 12.6,
  east: 9.4,
}

/**
 * Default viewport: the Lagos–Ibadan–Benin triangle where most traffic sits.
 * Zoom is a Mapbox GL level (512px world tiles).
 */
export const DEFAULT_MAP_VIEW = {
  center: { lat: 7.1, lng: 5.1 },
  zoom: 6,
} as const

function waypoint(
  id: string,
  name: string,
  lat: number,
  lng: number,
  kind: Waypoint["kind"] = "junction"
): Waypoint {
  return { id, name, lat, lng, kind }
}

/**
 * Network nodes. Cities double as origins/destinations; junctions shape the
 * corridor geometry so vehicles track the real road alignment instead of
 * drawing straight lines across the country.
 */
const WAYPOINTS: readonly Waypoint[] = [
  // Lagos metro
  waypoint("apapa", "Apapa Port", 6.4474, 3.359, "depot"),
  waypoint("costain", "Costain", 6.4867, 3.3681),
  waypoint("yaba", "Yaba", 6.5095, 3.3711),
  waypoint("ojota", "Ojota", 6.5833, 3.3833),
  waypoint("ikeja", "Ikeja", 6.6018, 3.3515, "hub"),
  waypoint("ojodu", "Ojodu", 6.6333, 3.3667),
  waypoint("berger", "Berger", 6.65, 3.36),
  waypoint("lekki", "Lekki Phase 1", 6.4412, 3.4731),
  waypoint("lagos-island", "Lagos Island", 6.4541, 3.3947, "city"),
  waypoint("sango-ota", "Sango Ota", 6.6966, 3.2403),
  waypoint("owode", "Owode", 6.9333, 3.2667),
  // Lagos -> Ibadan
  waypoint("ibafo", "Ibafo", 6.75, 3.4),
  waypoint("mowe", "Mowe", 6.8167, 3.4333),
  waypoint("sagamu", "Sagamu Interchange", 6.8485, 3.6463),
  waypoint("ogere", "Ogere", 6.8, 3.75),
  waypoint("ibadan-toll", "Ibadan Toll Gate", 7.3167, 3.9167),
  waypoint("ibadan", "Ibadan Challenge", 7.3775, 3.947, "city"),
  waypoint("abeokuta", "Abeokuta Kuto", 7.1557, 3.3451, "city"),
  // Lagos -> Benin
  waypoint("ijebu-ode", "Ijebu Ode", 6.82, 3.917),
  waypoint("ore", "Ore", 6.75, 4.8833),
  waypoint("benin-bypass", "Benin Bypass", 6.3, 5.5),
  waypoint("benin-city", "Benin City Ring Road", 6.335, 5.6037, "city"),
  // Benin -> Onitsha -> Enugu
  waypoint("agbor", "Agbor", 6.25, 6.2),
  waypoint("asaba", "Asaba", 6.198, 6.733),
  waypoint("onitsha", "Onitsha Head Bridge", 6.1414, 6.8022, "city"),
  waypoint("awka", "Awka", 6.2101, 7.0741),
  waypoint("enugu", "Enugu Ogui", 6.4402, 7.4943, "city"),
  // Benin -> Port Harcourt
  waypoint("sapele", "Sapele", 5.8942, 5.677),
  waypoint("warri", "Warri", 5.516, 5.75, "hub"),
  waypoint("ughelli", "Ughelli", 5.5, 6.0),
  waypoint("patani", "Patani", 5.2167, 6.1833),
  waypoint("ahoada", "Ahoada", 5.0833, 6.65),
  waypoint("port-harcourt", "Port Harcourt Trans-Amadi", 4.8156, 7.0498, "city"),
  waypoint("onne", "Onne Port", 4.7167, 7.1667, "depot"),
  // Ibadan -> Ilorin -> Abuja
  waypoint("oyo", "Oyo", 7.8526, 3.9313),
  waypoint("ogbomosho", "Ogbomosho", 8.1333, 4.25),
  waypoint("ilorin", "Ilorin Tanke", 8.4966, 4.5421, "city"),
  waypoint("jebba", "Jebba", 9.1333, 4.8333),
  waypoint("mokwa", "Mokwa", 9.2939, 5.05),
  waypoint("lapai", "Lapai", 9.045, 6.57),
  waypoint("suleja", "Suleja", 9.18, 7.18),
  waypoint("abuja", "Abuja Central", 9.0765, 7.3986, "city"),
  waypoint("gwagwalada", "Gwagwalada", 8.9428, 7.0797),
  waypoint("nyanya", "Nyanya", 9.0, 7.5667),
  // Abuja -> Kano
  waypoint("zuba", "Zuba", 9.1, 7.2),
  waypoint("kaduna", "Kaduna Central", 10.5222, 7.4383, "hub"),
  waypoint("zaria", "Zaria", 11.0855, 7.7199),
  waypoint("kano", "Kano Bompai", 12.0022, 8.592, "city"),
  // Lokoja spur (Abuja -> Onitsha)
  waypoint("lokoja", "Lokoja", 7.8023, 6.7333),
  waypoint("okene", "Okene", 7.55, 6.2333),
]

export const WAYPOINT_BY_ID: Readonly<Record<string, Waypoint>> = Object.freeze(
  Object.fromEntries(WAYPOINTS.map((point) => [point.id, point]))
)

/**
 * Freight corridors. Each corridor is traversable in both directions; the route
 * builder derives the reverse variant automatically.
 */
export const CORRIDORS: readonly Corridor[] = [
  {
    id: "lag-iba",
    name: "Lagos – Ibadan Expressway",
    from: "lagos",
    to: "ibadan",
    waypointIds: [
      "apapa",
      "costain",
      "ojota",
      "ojodu",
      "berger",
      "ibafo",
      "mowe",
      "sagamu",
      "ogere",
      "ibadan-toll",
      "ibadan",
    ],
    freeFlowSpeed: 78,
  },
  {
    id: "lag-abk",
    name: "Lagos – Abeokuta Expressway",
    from: "lagos",
    to: "abeokuta",
    waypointIds: ["apapa", "yaba", "ikeja", "sango-ota", "owode", "abeokuta"],
    freeFlowSpeed: 68,
  },
  {
    id: "lag-ben",
    name: "Lagos – Benin Highway",
    from: "lagos",
    to: "benin-city",
    waypointIds: [
      "lagos-island",
      "lekki",
      "ojota",
      "sagamu",
      "ijebu-ode",
      "ore",
      "benin-bypass",
      "benin-city",
    ],
    freeFlowSpeed: 82,
  },
  {
    id: "ben-oni",
    name: "Benin – Onitsha Expressway",
    from: "benin-city",
    to: "onitsha",
    waypointIds: ["benin-city", "agbor", "asaba", "onitsha"],
    freeFlowSpeed: 74,
  },
  {
    id: "oni-enu",
    name: "Onitsha – Enugu Expressway",
    from: "onitsha",
    to: "enugu",
    waypointIds: ["onitsha", "awka", "enugu"],
    freeFlowSpeed: 70,
  },
  {
    id: "ben-phc",
    name: "Benin – Port Harcourt Road",
    from: "benin-city",
    to: "port-harcourt",
    waypointIds: [
      "benin-city",
      "sapele",
      "warri",
      "ughelli",
      "patani",
      "ahoada",
      "port-harcourt",
      "onne",
    ],
    freeFlowSpeed: 66,
  },
  {
    id: "iba-ilo",
    name: "Ibadan – Ilorin Road",
    from: "ibadan",
    to: "ilorin",
    waypointIds: ["ibadan", "oyo", "ogbomosho", "ilorin"],
    freeFlowSpeed: 72,
  },
  {
    id: "ilo-abj",
    name: "Ilorin – Abuja Road",
    from: "ilorin",
    to: "abuja",
    waypointIds: ["ilorin", "jebba", "mokwa", "lapai", "suleja", "abuja"],
    freeFlowSpeed: 76,
  },
  {
    id: "abj-kan",
    name: "Abuja – Kano Expressway",
    from: "abuja",
    to: "kano",
    waypointIds: ["abuja", "zuba", "kaduna", "zaria", "kano"],
    freeFlowSpeed: 84,
  },
  {
    id: "abj-oni",
    name: "Abuja – Onitsha via Lokoja",
    from: "abuja",
    to: "onitsha",
    waypointIds: ["abuja", "gwagwalada", "lokoja", "okene", "asaba", "onitsha"],
    freeFlowSpeed: 70,
  },
  {
    id: "lag-metro",
    name: "Lagos Metro Distribution",
    from: "lagos",
    to: "lagos",
    waypointIds: ["apapa", "costain", "yaba", "ojota", "ikeja", "berger"],
    freeFlowSpeed: 34,
  },
  {
    id: "abj-metro",
    name: "Abuja Metro Distribution",
    from: "abuja",
    to: "abuja",
    waypointIds: ["abuja", "nyanya", "gwagwalada", "zuba", "suleja"],
    freeFlowSpeed: 46,
  },
  {
    id: "phc-metro",
    name: "Port Harcourt Metro Distribution",
    from: "port-harcourt",
    to: "port-harcourt",
    waypointIds: ["onne", "port-harcourt", "ahoada"],
    freeFlowSpeed: 38,
  },
]
