/**
 * Pure route analytics (§9 C3) — total distance + estimated travel time for a route,
 * computed from its snapped geometry (or a straight-line fallback through the stops).
 * Kept pure + unit-tested (routeStats.test.ts); the RouteBuilder renders the result
 * as a small trail-card stat line. No network — elevation gain is a deferred extra.
 */
import { distanceMeters } from './geo'
import { normalizeSolidSegments } from './route-legs'
import type { Route, TravelMode } from './types'

export type LatLng = [number, number] // [lat, lng]

/** Length of a single polyline in metres (sum of consecutive great-circle hops). */
export function polylineMeters(coords: LatLng[]): number {
  let m = 0
  for (let i = 1; i < coords.length; i++) {
    m += distanceMeters(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1])
  }
  return m
}

/** Total length across an array of polyline segments. */
export function segmentsMeters(segments: LatLng[][]): number {
  return segments.reduce((sum, seg) => sum + polylineMeters(seg), 0)
}

/**
 * Best-available route length: the snapped `geometry` when present (street/trail
 * following), otherwise straight lines through `fallbackPath` (the stop spine).
 */
export function routeMeters(
  geometry: Route['geometry'],
  fallbackPath: LatLng[],
): number {
  const segs = normalizeSolidSegments(geometry)
  if (segs) {
    const m = segmentsMeters(segs)
    if (m > 0) return m
  }
  return polylineMeters(fallbackPath)
}

// Rough average speeds (m/s) for time estimates — deliberately simple; the label
// says "~" so these read as ballpark, not turn-by-turn ETAs.
const SPEED_MPS: Record<TravelMode, number> = {
  'foot-walking': 1.4,    // ~5 km/h
  'foot-hiking': 1.1,     // ~4 km/h
  'cycling-regular': 4.2, // ~15 km/h
  'driving-car': 11.1,    // ~40 km/h (urban)
}

/** Estimated travel time in whole minutes for a distance + travel mode. */
export function estimateDurationMin(meters: number, mode: TravelMode): number {
  const mps = SPEED_MPS[mode] ?? SPEED_MPS['foot-walking']
  return Math.round(meters / mps / 60)
}

/** "12 min" / "1 h 5 min" / "2 h". */
export function formatDuration(min: number): string {
  if (min <= 0) return '0 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

// Average walking step length (m). Adult stride is roughly 0.75 m; keeps the
// count a ballpark ("~"), same spirit as the duration estimates.
const STEP_LENGTH_M = 0.75

/** Roughly how many steps it'd take to walk `meters` on foot. */
export function estimateSteps(meters: number): number {
  return Math.max(0, Math.round(meters / STEP_LENGTH_M))
}

/** "3,200 steps" / "1 step" (thousands-separated). */
export function formatSteps(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'step' : 'steps'}`
}
