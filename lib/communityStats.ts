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
  count: number // points the box is built from (after outlier trimming)
  total: number // finite points before trimming
  trimmed: number // how many far-flung outliers were dropped (total − count)
  widthM: number // E–W extent (metres, measured at the box's mid-latitude)
  heightM: number // N–S extent (metres)
  diagM: number // corner-to-corner span (metres)
  areaKm2: number // bounding-box area (km²)
}

/** Median of a numeric list (unsorted ok). NaN for an empty list. */
function median(nums: number[]): number {
  if (nums.length === 0) return NaN
  const s = [...nums].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Trimming only kicks in once there are enough points for the statistic to mean
// something; below this we trust every pin.
const MIN_TO_TRIM = 6
// A pin is judged by how far its K-th nearest neighbour is. K=2 means a lone pin —
// OR a stray pair — counts as isolated, while any cluster of ≥3 is "real".
const KNN = 2
// Modified z-score cutoff (Iglewicz–Hoaglin): 0.6745 rescales MAD to a σ estimate,
// |z| > 3.5 is the standard outlier line.
const MAD_Z = 3.5
// Above this the O(n²) neighbour scan isn't worth it; a community that big is
// genuinely wide, so we skip trimming and report the full box.
const TRIM_CAP = 2000

/** Each point's distance (m) to its k-th nearest neighbour among the set. */
function kthNearestDistances(points: LatLngPoint[], k: number): number[] {
  return points.map((p, i) => {
    const ds: number[] = []
    for (let j = 0; j < points.length; j++) {
      if (j === i) continue
      ds.push(distanceMeters(p.lat, p.lng, points[j].lat, points[j].lng))
    }
    ds.sort((a, b) => a - b)
    return ds[Math.min(k - 1, ds.length - 1)]
  })
}

/**
 * Drop far-flung outlier pins so a couple of strays don't blow up the box.
 *
 * A radial "distance from the centre" rule fails on communities that genuinely
 * span two cities — each cluster inflates the spread until nothing looks
 * abnormal. Instead we judge each pin by its k-th-nearest-neighbour distance: a
 * pin sitting alone (its neighbours are far away) is an outlier; a pin inside
 * either real cluster is not. The kNN distances are then thresholded with the
 * robust MAD modified z-score. Returns the kept subset (or the input unchanged
 * when there are too few points, too many, or nothing looks isolated).
 */
export function trimOutliers(points: LatLngPoint[]): LatLngPoint[] {
  if (points.length < MIN_TO_TRIM || points.length > TRIM_CAP) return points
  const kdist = kthNearestDistances(points, KNN)
  const med = median(kdist)
  const mad = median(kdist.map((d) => Math.abs(d - med)))
  if (mad === 0) return points // degenerate (a dense mass of coincident pins)
  const cutoff = med + (MAD_Z / 0.6745) * mad
  const kept = points.filter((_, i) => kdist[i] <= cutoff)
  return kept.length >= 2 ? kept : points
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
 * Full spread of a community's pins. Far-flung outliers are trimmed first (see
 * trimOutliers) so the box reflects where the community actually lives, not the
 * two strays someone dropped across the country. Pass `{ trim: false }` for the
 * raw box. Returns null when there aren't at least two points that actually
 * differ (a single location has no breadth to report).
 */
export function computeSpread(
  points: LatLngPoint[],
  opts: { trim?: boolean } = {},
): CommunitySpread | null {
  const finite = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (finite.length === 0) return null
  const used = opts.trim === false ? finite : trimOutliers(finite)

  const bounds = computeBounds(used)
  if (!bounds) return null
  const { south, north, west, east } = bounds
  if (south === north && west === east) return null // all kept pins on one spot

  const midLat = (south + north) / 2
  const widthM = distanceMeters(midLat, west, midLat, east)
  const heightM = distanceMeters(south, west, north, west)
  const diagM = distanceMeters(south, west, north, east)
  const areaKm2 = (widthM / 1000) * (heightM / 1000)
  return {
    bounds,
    count: used.length,
    total: finite.length,
    trimmed: finite.length - used.length,
    widthM,
    heightM,
    diagM,
    areaKm2,
  }
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
