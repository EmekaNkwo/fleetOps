import type { Location } from "@/types"

const EARTH_RADIUS_KM = 6_371
const DEG = Math.PI / 180
const RAD = 180 / Math.PI

function toRadians(degrees: number): number {
  return degrees * DEG
}

function toDegrees(radians: number): number {
  return radians * RAD
}

/** Great-circle distance in kilometres. */
export function haversineKm(from: Location, to: Location): number {
  const dLat = toRadians(to.lat - from.lat)
  const dLng = toRadians(to.lng - from.lng)
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Initial bearing in degrees clockwise from north, normalised to [0, 360). */
export function bearingDegrees(from: Location, to: Location): number {
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const dLng = toRadians(to.lng - from.lng)

  const y = Math.sin(dLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)

  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

/**
 * Linear interpolation between two coordinates. Over the few-kilometre spans
 * between our waypoints the error against a true great-circle interpolation is
 * well under a metre, so the cheaper form is the right trade here.
 */
export function interpolate(from: Location, to: Location, t: number): Location {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t
  return {
    lat: from.lat + (to.lat - from.lat) * clamped,
    lng: from.lng + (to.lng - from.lng) * clamped,
  }
}

/** Shortest signed angular difference, in degrees, from `a` to `b`. */
function angleDelta(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180
}

/** Eases a heading towards a target without snapping through 360°. */
export function approachHeading(
  current: number,
  target: number,
  factor: number
): number {
  return (current + angleDelta(current, target) * factor + 360) % 360
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function formatCoordinate(location: Location): string {
  const lat = `${Math.abs(location.lat).toFixed(4)}°${location.lat >= 0 ? "N" : "S"}`
  const lng = `${Math.abs(location.lng).toFixed(4)}°${location.lng >= 0 ? "E" : "W"}`
  return `${lat} ${lng}`
}
