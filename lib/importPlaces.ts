/**
 * Google Maps saved-places importer — PURE parsing (no network).
 *
 * Turns a Google Takeout export into normalized places ready for the
 * `import_pins()` RPC. Two input shapes are supported:
 *   • GeoJSON  ("Maps (your places)" → *.json) — has real coordinates. Reliable.
 *   • CSV      (a saved list export → *.csv, columns Title/Note/URL/Comment) —
 *              coordinates are only present when the Google Maps URL embeds them;
 *              otherwise the row is flagged `needsGeocode` for an optional
 *              name-based lookup step in the UI.
 *
 * This is the import TRUST BOUNDARY: every value here is clamped to the same
 * limits the DB enforces (title 1–100, description ≤500, url http(s) ≤500,
 * lat/lng in range) so the batch RPC and CHECK constraints never reject a row.
 * Kept pure + unit-tested (importPlaces.test.ts) so a subtle divergence can't
 * silently drop or corrupt someone's whole saved-places history.
 */

export interface ParsedPlace {
  title: string
  note: string | null
  url: string | null
  lat: number | null
  lng: number | null
  /** true when we have a usable title but no coordinates yet (CSV rows). */
  needsGeocode: boolean
}

export type ImportFormat = 'geojson' | 'csv' | 'unknown'

export interface ParseResult {
  places: ParsedPlace[]
  format: ImportFormat
  /** Rows dropped for having no usable title (can't become a pin). */
  skipped: number
}

// ── Field limits (mirror the DB CHECK constraints / import_pins validation) ────

const TITLE_MAX = 100
const DESC_MAX = 500
const URL_MAX = 500

/** Clamp to a valid pin title, or null if nothing usable remains. */
export function clampTitle(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return null
  return t.slice(0, TITLE_MAX)
}

function clampNote(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim()
  return t ? t.slice(0, DESC_MAX) : null
}

/** Keep only http(s) links within the length cap; everything else → null. */
export function clampUrl(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim()
  if (!t || !/^https?:\/\//i.test(t) || t.length > URL_MAX) return null
  return t
}

/** Valid, non-null-island coordinate pair, or null. */
export function validCoords(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  // (0, 0) is the "null island" default many broken exports produce — treat as absent.
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

// ── Coordinates embedded in a Google Maps URL ─────────────────────────────────

/**
 * Pull a lat/lng out of a Google Maps URL when one is embedded. Tries the most
 * precise forms first: the `!3d<lat>!4d<lng>` place marker, then the `@lat,lng`
 * map centre, then the various query-style params.
 */
export function extractLatLngFromUrl(url: string | null | undefined): { lat: number; lng: number } | null {
  if (!url) return null
  const num = '(-?\\d+\\.?\\d*)'

  // Place marker: …!3d37.77!4d-122.41 (most precise — the pinned place)
  const marker = url.match(new RegExp(`!3d${num}!4d${num}`))
  if (marker) {
    const c = validCoords(parseFloat(marker[1]), parseFloat(marker[2]))
    if (c) return c
  }

  // Map centre: …/@37.77,-122.41,15z
  const at = url.match(new RegExp(`@${num},${num}`))
  if (at) {
    const c = validCoords(parseFloat(at[1]), parseFloat(at[2]))
    if (c) return c
  }

  // Query params: q= / ll= / query= / destination= / daddr= …=lat,lng
  const param = url.match(new RegExp(`[?&](?:q|ll|query|destination|daddr)=${num},${num}`, 'i'))
  if (param) {
    const c = validCoords(parseFloat(param[1]), parseFloat(param[2]))
    if (c) return c
  }

  return null
}

// ── GeoJSON ("Maps (your places)") ────────────────────────────────────────────

interface GeoFeature {
  geometry?: { type?: string; coordinates?: unknown }
  properties?: Record<string, unknown>
}

function pickString(obj: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!obj) return null
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return null
}

function placeFromFeature(f: GeoFeature): ParsedPlace | null {
  const props = f.properties ?? {}
  const location = (props.location as Record<string, unknown> | undefined) ?? undefined

  const title = clampTitle(
    pickString(location, 'name') ??
      pickString(props, 'name', 'Title', 'title')
  )
  if (!title) return null

  const note = clampNote(
    pickString(location, 'address') ??
      pickString(props, 'address', 'Note', 'note', 'Comment', 'comment')
  )
  const url = clampUrl(
    pickString(props, 'google_maps_url', 'Google Maps URL', 'url', 'URL')
  )

  let lat: number | null = null
  let lng: number | null = null
  const coords = f.geometry?.coordinates
  if (Array.isArray(coords) && coords.length >= 2) {
    // GeoJSON order is [lng, lat].
    const c = validCoords(Number(coords[1]), Number(coords[0]))
    if (c) { lat = c.lat; lng = c.lng }
  }
  // Fall back to coordinates embedded in the maps URL.
  if (lat == null && url) {
    const c = extractLatLngFromUrl(url)
    if (c) { lat = c.lat; lng = c.lng }
  }

  return { title, note, url, lat, lng, needsGeocode: lat == null }
}

export function parseGeoJSON(text: string): ParsedPlace[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  const features =
    (data as { features?: unknown })?.features ??
    (Array.isArray(data) ? data : null)
  if (!Array.isArray(features)) return []

  const out: ParsedPlace[] = []
  for (const f of features) {
    const place = placeFromFeature(f as GeoFeature)
    if (place) out.push(place)
  }
  return out
}

// ── CSV (a saved list export) ─────────────────────────────────────────────────

/** Split one CSV line respecting double-quoted fields and "" escapes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(field); field = ''
    } else field += ch
  }
  out.push(field)
  return out
}

/** Split CSV text into logical rows, honouring newlines inside quoted fields. */
function splitCsvRows(text: string): string[] {
  const rows: string[] = []
  let row = ''
  let inQuotes = false
  const src = text.replace(/\r\n?/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === '"') { inQuotes = !inQuotes; row += ch }
    else if (ch === '\n' && !inQuotes) { rows.push(row); row = '' }
    else row += ch
  }
  if (row.length) rows.push(row)
  return rows
}

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim())
}

export function parseCsv(text: string): ParsedPlace[] {
  const rows = splitCsvRows(text).filter((r) => r.trim() !== '')
  if (rows.length === 0) return []

  const header = splitCsvLine(rows[0]).map((h) => h.trim().toLowerCase())
  const hasHeader = header.some((h) => ['title', 'name', 'url', 'note', 'comment'].includes(h))

  const col = (...names: string[]) => {
    for (const n of names) {
      const idx = header.indexOf(n)
      if (idx !== -1) return idx
    }
    return -1
  }
  const titleIdx = hasHeader ? col('title', 'name') : 0
  const noteIdx = hasHeader ? col('note', 'comment') : -1
  const urlIdx = hasHeader ? col('url') : -1

  const out: ParsedPlace[] = []
  const dataRows = hasHeader ? rows.slice(1) : rows
  for (const raw of dataRows) {
    const cells = splitCsvLine(raw)
    const title = clampTitle(cells[titleIdx])
    if (!title) continue

    // URL: named column, else any cell that looks like a link.
    let url = urlIdx !== -1 ? cells[urlIdx] : undefined
    if (!url) url = cells.find((c) => looksLikeUrl(c))
    const cleanUrl = clampUrl(url)

    const note = noteIdx !== -1 ? clampNote(cells[noteIdx]) : null

    const coords = extractLatLngFromUrl(url ?? null)
    out.push({
      title,
      note,
      url: cleanUrl,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      needsGeocode: coords == null,
    })
  }
  return out
}

// ── Dispatch + dedupe ─────────────────────────────────────────────────────────

/** Drop duplicate places (same title + coarse location, or same title+url). */
export function dedupePlaces(places: ParsedPlace[]): ParsedPlace[] {
  const seen = new Set<string>()
  const out: ParsedPlace[] = []
  for (const p of places) {
    const geoKey =
      p.lat != null && p.lng != null
        ? `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
        : (p.url ?? '')
    const key = `${p.title.toLowerCase()}|${geoKey}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

/** Detect the format from filename/content and parse into deduped places. */
export function parsePlacesFile(filename: string, text: string): ParseResult {
  const lower = filename.toLowerCase()
  const trimmed = text.trimStart()
  const isJson = lower.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')
  const isCsv = lower.endsWith('.csv') || (!isJson && text.includes(','))

  let format: ImportFormat = 'unknown'
  let places: ParsedPlace[] = []
  if (isJson) {
    format = 'geojson'
    places = parseGeoJSON(text)
  } else if (isCsv) {
    format = 'csv'
    places = parseCsv(text)
  }

  const deduped = dedupePlaces(places)
  return { places: deduped, format, skipped: places.length - deduped.length }
}
