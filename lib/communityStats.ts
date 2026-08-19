/**
 * Pure community-breadth analytics — how much geographic space a community's
 * pins cover. Given the pins' coordinates it derives a bounding box, its E–W and
 * N–S extents, the corner-to-corner span, and the box area. Kept pure +
 * unit-tested (communityStats.test.ts); surfaced as a "Coverage" stat on the
 * community page and in the in-app community panel. No network.
 */
import { distanceMeters, formatDistance } from './geo'

export interface LatLngPoint {
  lat: number
  lng: number
}

export interface Bounds {
  south: number // min latitude
  north: number // max latitude
  west: number // min longitude
  east: number // max longitude
}

export interface CommunitySpread {
  bounds: Bounds
  count: number // points considered
  widthM: number // E–W extent (metres, measured at the box's mid-latitude)
  heightM: number // N–S extent (metres)
  diagM: number // corner-to-corner span (metres)
  areaKm2: number // bounding-box area (km²)
}

/** Tight bounding box of the points, or null if none have finite coords. */
export function computeBounds(points: LatLngPoint[]): Bounds | null {
  let south = Infinity
  let north = -Infinity
  let west = Infinity
  let east = -Infinity
  let n = 0
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    south = Math.min(south, p.lat)
    north = Math.max(north, p.lat)
    west = Math.min(west, p.lng)
    east = Math.max(east, p.lng)
    n++
  }
  if (n === 0) return null
  return { south, north, west, east }
}

/**
 * Full spread of a community's pins. Returns null when there aren't at least two
 * points that actually differ (a single location has no breadth to report).
 */
export function computeSpread(points: LatLngPoint[]): CommunitySpread | null {
  const finite = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  const bounds = computeBounds(finite)
  if (!bounds) return null
  const { south, north, west, east } = bounds
  if (south === north && west === east) return null // all pins on one spot

  const midLat = (south + north) / 2
  const widthM = distanceMeters(midLat, west, midLat, east)
  const heightM = distanceMeters(south, west, north, west)
  const diagM = distanceMeters(south, west, north, east)
  const areaKm2 = (widthM / 1000) * (heightM / 1000)
  return { bounds, count: finite.length, widthM, heightM, diagM, areaKm2 }
}

/**
 * Headline breadth: the corner-to-corner span as a distance. A linear measure is
 * more legible than the bounding-box area (which squares any outlier) — "13 km"
 * for a neighbourhood, "3,915 km" for a coast-to-coast community. Integer km once
 * past 10 km so the number stays clean.
 */
export function formatCoverage(s: CommunitySpread): string {
  const km = s.diagM / 1000
  if (km < 1) return `${Math.round(s.diagM)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km).toLocaleString('en-US')} km`
}

/** Format a bounding-box area, scaling the unit to the size ("8.8 km²" / "1,200 m²"). */
export function formatArea(km2: number): string {
  if (km2 >= 10) return `${Math.round(km2).toLocaleString('en-US')} km²`
  if (km2 >= 1) return `${km2.toFixed(1)} km²`
  if (km2 >= 0.1) return `${km2.toFixed(2)} km²`
  return `${Math.round(km2 * 1_000_000).toLocaleString('en-US')} m²`
}

/** "4.2 km × 2.1 km" — the E–W by N–S extents. */
export function formatSpan(s: CommunitySpread): string {
  return `${formatDistance(s.widthM)} × ${formatDistance(s.heightM)}`
}
