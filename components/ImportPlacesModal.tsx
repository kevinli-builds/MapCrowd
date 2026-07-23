'use client'

import { useRef, useState } from 'react'
import { Upload, Loader2, X, MapPin, AlertTriangle, Check, Lock, Globe } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { forwardGeocode } from '@/lib/geo'
import { parsePlacesFile, type ParsedPlace, type ParseResult } from '@/lib/importPlaces'
import { COMMUNITY_COLORS } from '@/lib/constants'

// Max upload we'll parse in the browser (a huge saved-places export is still small text).
const MAX_FILE_BYTES = 5 * 1024 * 1024
// import_pins caps a single call at 500 rows — chunk larger imports.
const CHUNK = 500
// Nominatim asks for ≤1 req/s; stay comfortably under it while locating by name.
const GEOCODE_DELAY_MS = 1100

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function toSlug(name: string): string {
  const base =
    name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'imported'
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}

interface ImportPlacesModalProps {
  userId: string
  onClose: () => void
  /** Fires after a successful import so the parent can select + refresh. */
  onSuccess: (communityId: string, imported: number) => void
}

export default function ImportPlacesModal({ userId, onClose, onSuccess }: ImportPlacesModalProps) {
  const [result, setResult] = useState<ParseResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  const [name, setName] = useState('Imported places')
  const [isPrivate, setIsPrivate] = useState(true)
  const [geocodeRest, setGeocodeRest] = useState(false)

  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelled = useRef(false)

  const located = result ? result.places.filter((p) => p.lat != null).length : 0
  const needLocating = result ? result.places.length - located : 0
  // How many pins we'll actually create: located now, plus the rest iff geocoding is on.
  const willImport = located + (geocodeRest ? needLocating : 0)

  async function handleFile(file: File | undefined) {
    setParseError(null)
    setError(null)
    setResult(null)
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setParseError('That file is larger than 5 MB — is it definitely a saved-places export?')
      return
    }
    try {
      const text = await file.text()
      const parsed = parsePlacesFile(file.name, text)
      setFileName(file.name)
      if (parsed.format === 'unknown' || parsed.places.length === 0) {
        setParseError(
          "Couldn't find any places in that file. Export from Google Takeout — either “Saved” (a list .csv) or “Maps (your places)” (a .json)."
        )
        return
      }
      setResult(parsed)
    } catch {
      setParseError("Couldn't read that file.")
    }
  }

  async function handleImport() {
    if (!result || busy || !name.trim()) return
    cancelled.current = false
    setBusy(true)
    setError(null)

    try {
      // 1. Optionally locate the rows that had no coordinates, throttled for Nominatim.
      let places: ParsedPlace[] = result.places
      if (geocodeRest && needLocating > 0) {
        const toLocate = places.filter((p) => p.lat == null)
        setProgress({ label: 'Locating places', done: 0, total: toLocate.length })
        const located: ParsedPlace[] = []
        for (let i = 0; i < toLocate.length; i++) {
          if (cancelled.current) { setBusy(false); setProgress(null); return }
          const p = toLocate[i]
          const hit = await forwardGeocode(p.note ? `${p.title}, ${p.note}` : p.title)
          if (hit) located.push({ ...p, lat: hit.lat, lng: hit.lng, needsGeocode: false })
          setProgress({ label: 'Locating places', done: i + 1, total: toLocate.length })
          if (i < toLocate.length - 1) await sleep(GEOCODE_DELAY_MS)
        }
        places = [...places.filter((p) => p.lat != null), ...located]
      } else {
        places = places.filter((p) => p.lat != null)
      }

      if (places.length === 0) {
        setError('No places could be located, so there is nothing to import.')
        setBusy(false)
        setProgress(null)
        return
      }

      // 2. Create the destination community and make the user its mod + subscriber.
      setProgress(null)
      const { data: community, error: cErr } = await supabase
        .from('communities')
        .insert({
          name: name.trim(),
          slug: toSlug(name.trim()),
          description: 'Imported from Google Maps',
          icon: '🗺️',
          color: COMMUNITY_COLORS[0],
          is_private: isPrivate,
          created_by: userId,
        })
        .select()
        .single()
      if (cErr || !community) throw new Error('Could not create the community.')

      await supabase.from('community_moderators').insert({
        community_id: community.id,
        user_id: userId,
        assigned_by: userId,
      })
      await supabase.from('community_subscriptions').insert({
        community_id: community.id,
        user_id: userId,
      })

      // 3. Insert pins in ≤500-row batches via the SECURITY DEFINER RPC.
      const payload = places.map((p) => ({
        title: p.title,
        note: p.note,
        url: p.url,
        lat: p.lat,
        lng: p.lng,
      }))
      let imported = 0
      for (let i = 0; i < payload.length; i += CHUNK) {
        const chunk = payload.slice(i, i + CHUNK)
        setProgress({ label: 'Adding pins', done: Math.min(i + chunk.length, payload.length), total: payload.length })
        const { data, error: iErr } = await supabase.rpc('import_pins', {
          p_community_id: community.id,
          p_places: chunk,
        })
        if (iErr) throw new Error(iErr.message)
        imported += typeof data === 'number' ? data : 0
      }

      onSuccess(community.id, imported)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed — please try again.')
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div
      className="absolute inset-0 z-[1250] flex items-end bg-black/50 sm:items-center sm:justify-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        className="w-full overflow-y-auto overflow-x-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl"
        style={{ maxHeight: '90dvh' }}
      >
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-indigo-600" />
            <h2 className="font-semibold text-gray-900">Import from Google Maps</h2>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Step 1 — pick a file */}
          {!result && (
            <>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                <p className="mb-2 font-medium text-gray-900">Bring your saved places onto the map</p>
                <ol className="list-decimal space-y-1 pl-4 text-gray-600">
                  <li>
                    Go to{' '}
                    <a
                      href="https://takeout.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 underline"
                    >
                      Google Takeout
                    </a>
                  </li>
                  <li>Export <span className="font-medium">Saved</span> (list <code>.csv</code>) or <span className="font-medium">Maps (your places)</span> (<code>.json</code>)</li>
                  <li>Drop the file below</li>
                </ol>
              </div>

              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center transition-colors hover:border-indigo-400 hover:bg-indigo-50/40">
                <Upload className="h-6 w-6 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Choose a .json or .csv file</span>
                <span className="text-xs text-gray-400">Nothing is uploaded until you confirm</span>
                <input
                  type="file"
                  accept=".json,.csv,application/json,text/csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>

              {parseError && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-amber-800">{parseError}</p>
                </div>
              )}
            </>
          )}

          {/* Step 2 — review + configure */}
          {result && (
            <>
              {/* Summary */}
              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{fileName}</p>
                  <p className="text-xs text-gray-500">
                    {result.places.length} place{result.places.length === 1 ? '' : 's'} found
                    {result.skipped > 0 && ` · ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} removed`}
                  </p>
                </div>
                <button
                  onClick={() => { setResult(null); setParseError(null); setError(null) }}
                  disabled={busy}
                  className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                >
                  Change
                </button>
              </div>

              <div className="flex gap-3">
                <div className="flex-1 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-green-700">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="text-lg font-semibold">{located}</span>
                  </div>
                  <p className="text-xs text-gray-500">ready to place</p>
                </div>
                <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-gray-700">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-lg font-semibold">{needLocating}</span>
                  </div>
                  <p className="text-xs text-gray-500">need locating</p>
                </div>
              </div>

              {/* Geocode-the-rest option */}
              {needLocating > 0 && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={geocodeRest}
                    onChange={(e) => setGeocodeRest(e.target.checked)}
                    disabled={busy}
                    className="mt-0.5 h-4 w-4 accent-indigo-600"
                  />
                  <span className="text-sm text-gray-600">
                    <span className="font-medium text-gray-900">Look up the other {needLocating} by name</span>
                    <br />
                    <span className="text-xs text-gray-500">
                      Uses OpenStreetMap search (~1s each, so about {Math.ceil((needLocating * GEOCODE_DELAY_MS) / 1000)}s). Less precise; some may not be found.
                    </span>
                  </span>
                </label>
              )}

              {/* Destination community */}
              <div>
                <label className="mb-1.5 block text-sm text-gray-600">New map name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                  disabled={busy}
                  className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPrivate(true)}
                    disabled={busy}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all ${
                      isPrivate ? 'border-indigo-500 bg-indigo-600/10 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Lock className="h-3.5 w-3.5" /> Private
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPrivate(false)}
                    disabled={busy}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all ${
                      !isPrivate ? 'border-indigo-500 bg-indigo-600/10 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" /> Public
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  {isPrivate
                    ? 'Only you can see this map. You can publish pins later.'
                    : 'Anyone can see this map — only make it public if you mean to share it.'}
                </p>
              </div>

              {/* Progress / error */}
              {progress && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-gray-500">
                    <span>{progress.label}…</span>
                    <span>{progress.done}/{progress.total}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all"
                      style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-red-700">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-700 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={busy || willImport === 0 || !name.trim()}
                  className="flex flex-[1.4] items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                  ) : (
                    <><Check className="h-4 w-4" /> Import {willImport} place{willImport === 1 ? '' : 's'}</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
