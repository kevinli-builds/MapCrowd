import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Pin, Route, RouteFolder, TravelMode } from '@/lib/types'
import { fetchRouteGeometry } from '@/lib/routing'
import { buildRouteLegs, stepsToLegSteps } from '@/lib/route-legs'

// Flat route stops grouped into ordered steps; pins sharing a step are alternatives.
// `equalOptions` (per step) marks the step's options as equal — the incoming main
// leg is dashed too, so the previous stop fans out to all of them as branches.
export type RouteStop = { pin: Pin; step: number; position: number; equalOptions: boolean }
export type RouteStepGroup = { step: number; pins: Pin[]; equalOptions: boolean }

export function groupRouteSteps(stops: RouteStop[]): RouteStepGroup[] {
  const byStep = new Map<number, RouteStop[]>()
  for (const s of stops) {
    const arr = byStep.get(s.step) ?? []
    arr.push(s)
    byStep.set(s.step, arr)
  }
  return [...byStep.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([step, rows]) => ({
      step,
      pins: rows.sort((a, b) => a.position - b.position).map((r) => r.pin),
      equalOptions: rows.some((r) => r.equalOptions),
    }))
}

interface UseRouteBuilderOptions {
  /** Called when a route is opened, so the page can hand the map to the builder
   *  (clear the selected community, close the mobile drawer). */
  onEnterBuilder?: () => void
}

/**
 * Routes / trails — the whole builder (see OPUS_BRIEF §7 step 5): the user's routes
 * and folders, the open route + its ordered stops + build mode, and the debounced
 * OpenRouteService recompute that snaps the path to streets/trails and persists it.
 * The most self-contained cluster; the page keeps only the derivations that combine
 * route state with pins (mapPins, routeStepGroups) and the map-tap handlers.
 */
export function useRouteBuilder(user: User | null, { onEnterBuilder }: UseRouteBuilderOptions = {}) {
  const [routes, setRoutes] = useState<Route[]>([])
  const [routeFolders, setRouteFolders] = useState<RouteFolder[]>([])
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null)
  const [routeStops, setRouteStops] = useState<RouteStop[]>([])
  // While the builder is open, which community's pins the map shows (so map taps
  // add the pins you're browsing). null = show all pins ("From map" tab).
  const [builderCommunityId, setBuilderCommunityId] = useState<string | null>(null)
  // When adding an alternative ("or") to an existing step, the target step index;
  // null = each added pin starts a new step.
  const [routeTargetStep, setRouteTargetStep] = useState<number | null>(null)
  // A public route opened via /?route=<id> that the viewer doesn't own (so it's
  // not in `routes`). Read-only. Cleared on close.
  const [externalRoute, setExternalRoute] = useState<Route | null>(null)
  // Snapped SOLID path as segments (this session's recompute); null = use stored / straight.
  const [routeGeometry, setRouteGeometry] = useState<[number, number][][] | null>(null)
  // Snapped DASHED legs (alternative spurs + equal-step main legs) for this session.
  const [branchGeometry, setBranchGeometry] = useState<[number, number][][] | null>(null)

  // ── Fetchers ────────────────────────────────────────────────────────────────
  const fetchRoutes = useCallback(async () => {
    if (!user) { setRoutes([]); return }
    const { data } = await supabase
      .from('routes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at')
    if (data) setRoutes(data as Route[])
  }, [user])

  const fetchRouteFolders = useCallback(async () => {
    if (!user) { setRouteFolders([]); return }
    const { data } = await supabase
      .from('route_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('position')
      .order('created_at')
    if (data) setRouteFolders(data as RouteFolder[])
  }, [user])

  useEffect(() => { fetchRoutes() }, [fetchRoutes])
  useEffect(() => { fetchRouteFolders() }, [fetchRouteFolders])

  // Close the builder + drop session geometry on sign-out.
  useEffect(() => {
    if (!user) {
      setActiveRouteId(null)
      setRouteStops([])
      setBuilderCommunityId(null)
      setRouteTargetStep(null)
      setExternalRoute(null)
      setRouteGeometry(null)
      setBranchGeometry(null)
    }
  }, [user])

  // ── Snapped-geometry recompute (owned routes only) ───────────────────────────
  // Recompute the snapped (street/trail-following) path when an OWNED route's stops
  // or travel mode change. Debounced; persists to routes.geometry so viewers (incl.
  // anonymous) render the path without re-hitting the routing API.
  const ownedActive = routes.find((r) => r.id === activeRouteId)
  const activeTravelMode = ownedActive?.travel_mode ?? null
  useEffect(() => {
    if (!activeRouteId || !ownedActive) return
    // Split the route into solid runs (the main path) + dashed legs (alternative
    // spurs and equal-step main legs). Each gets snapped independently so the
    // dashed branches follow streets/trails like the spine does.
    const { solidRuns, dashedLegs } = buildRouteLegs(stepsToLegSteps(groupRouteSteps(routeStops)))
    if (solidRuns.length === 0 && dashedLegs.length === 0) {
      setRouteGeometry(null); setBranchGeometry(null); return
    }
    const mode = activeTravelMode as TravelMode
    let cancelled = false
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      // Snap each run/leg; fall back to its straight coords if ORS is unavailable.
      const solid = await Promise.all(
        solidRuns.map(async (run) => (await fetchRouteGeometry(run, mode, ctrl.signal)) ?? run),
      )
      const dashed = await Promise.all(
        dashedLegs.map(async (leg) =>
          (await fetchRouteGeometry([leg.from, leg.to], mode, ctrl.signal)) ?? [leg.from, leg.to]),
      )
      if (cancelled) return
      setRouteGeometry(solid)
      setBranchGeometry(dashed)
      if (
        JSON.stringify(solid) !== JSON.stringify(ownedActive.geometry) ||
        JSON.stringify(dashed) !== JSON.stringify(ownedActive.branch_geometry)
      ) {
        await supabase.from('routes').update({ geometry: solid, branch_geometry: dashed }).eq('id', activeRouteId)
        setRoutes((prev) => prev.map((r) => (r.id === activeRouteId ? { ...r, geometry: solid, branch_geometry: dashed } : r)))
      }
    }, 600)
    return () => { cancelled = true; ctrl.abort(); clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRouteId, routeStops, activeTravelMode])

  // ── Open / close ─────────────────────────────────────────────────────────────
  const loadRouteStops = useCallback(async (routeId: string) => {
    const { data } = await supabase
      .from('route_pins')
      .select('step, position, equal_options, pin:pins(*, community:communities(*), profile:profiles(username, avatar_url))')
      .eq('route_id', routeId)
      .order('step')
      .order('position')
    const stops = (data ?? [])
      .map((r) => {
        const row = r as { step: number; position: number; equal_options: boolean; pin: Pin | Pin[] }
        const pin = Array.isArray(row.pin) ? row.pin[0] : row.pin
        return pin ? { pin, step: row.step, position: row.position, equalOptions: !!row.equal_options } : null
      })
      .filter((s): s is RouteStop => !!s)
    setRouteStops(stops)
  }, [])

  const selectRoute = useCallback((id: string) => {
    onEnterBuilder?.()               // the builder takes over the map area
    setActiveRouteId(id)
    setBuilderCommunityId(null)
    setRouteTargetStep(null)
    loadRouteStops(id)
  }, [onEnterBuilder, loadRouteStops])

  // Open any route by id (e.g. a community's published route from the panel):
  // your own → editable builder; someone else's public route → read-only viewer.
  const openRouteById = useCallback(async (id: string) => {
    if (routes.some((r) => r.id === id)) { selectRoute(id); return }
    const { data } = await supabase.from('routes').select('*').eq('id', id).maybeSingle()
    if (!data) return
    setExternalRoute(data as Route)
    onEnterBuilder?.()
    setActiveRouteId(id)
    setBuilderCommunityId(null)
    setRouteTargetStep(null)
    loadRouteStops(id)
  }, [routes, selectRoute, onEnterBuilder, loadRouteStops])

  const closeRoute = useCallback(() => {
    setActiveRouteId(null)
    setRouteStops([])
    setBuilderCommunityId(null)
    setRouteTargetStep(null)
    setExternalRoute(null)
    setRouteGeometry(null)
    setBranchGeometry(null)
  }, [])

  // ── Route CRUD ───────────────────────────────────────────────────────────────
  const setRouteMode = useCallback(async (id: string, mode: TravelMode) => {
    setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, travel_mode: mode } : r))) // optimistic; recompute effect refires
    await supabase.from('routes').update({ travel_mode: mode }).eq('id', id)
  }, [])

  const createRoute = useCallback(async (name: string): Promise<Route | null> => {
    if (!user) return null
    const { data, error } = await supabase
      .from('routes')
      .insert({ user_id: user.id, name: name.trim() })
      .select()
      .single()
    if (error || !data) return null
    setRoutes((prev) => [...prev, data as Route])
    return data as Route
  }, [user])

  const renameRoute = useCallback(async (id: string, name: string) => {
    await supabase.from('routes').update({ name: name.trim() }).eq('id', id)
    setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, name: name.trim() } : r)))
  }, [])

  // Set a route's visibility. Owner-only via RLS. Three states:
  //   private (isPublic=false), public link (isPublic=true, communityId=null),
  //   community route (isPublic=true, communityId set — all stops in that community).
  const publishRoute = useCallback(async (id: string, isPublic: boolean, communityId: string | null) => {
    const patch = { is_public: isPublic, community_id: isPublic ? communityId : null }
    setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r))) // optimistic
    await supabase.from('routes').update(patch).eq('id', id)
  }, [])

  const updateRouteColor = useCallback(async (id: string, color: string) => {
    setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, color } : r))) // optimistic
    await supabase.from('routes').update({ color }).eq('id', id)
  }, [])

  const deleteRoute = useCallback(async (id: string) => {
    await supabase.from('routes').delete().eq('id', id)
    setRoutes((prev) => prev.filter((r) => r.id !== id))
    setActiveRouteId((cur) => {
      if (cur === id) { setRouteStops([]); setBuilderCommunityId(null); return null }
      return cur
    })
  }, [])

  // ── Route folders ────────────────────────────────────────────────────────────
  const createRouteFolder = useCallback(async (name: string) => {
    if (!user || !name.trim()) return
    const { data } = await supabase
      .from('route_folders')
      .insert({ user_id: user.id, name: name.trim(), position: 0 })
      .select()
      .single()
    if (data) setRouteFolders((prev) => [...prev, data as RouteFolder])
  }, [user])

  const renameRouteFolder = useCallback(async (id: string, name: string) => {
    if (!name.trim()) return
    setRouteFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)))
    await supabase.from('route_folders').update({ name: name.trim() }).eq('id', id)
  }, [])

  const deleteRouteFolder = useCallback(async (id: string) => {
    // FK is ON DELETE SET NULL, so routes inside fall back to ungrouped.
    setRouteFolders((prev) => prev.filter((f) => f.id !== id))
    setRoutes((prev) => prev.map((r) => (r.folder_id === id ? { ...r, folder_id: null } : r)))
    await supabase.from('route_folders').delete().eq('id', id)
  }, [])

  const assignRouteFolder = useCallback(async (routeId: string, folderId: string | null) => {
    setRoutes((prev) => prev.map((r) => (r.id === routeId ? { ...r, folder_id: folderId } : r)))
    await supabase.from('routes').update({ folder_id: folderId }).eq('id', routeId)
  }, [])

  // ── Stop editing ─────────────────────────────────────────────────────────────
  const addPinToRoute = useCallback(async (pin: Pin) => {
    if (!activeRouteId) return
    if (routeStops.some((s) => s.pin.id === pin.id)) return // a pin appears at most once
    let step: number, position: number, equalOptions: boolean
    if (routeTargetStep != null) {
      // Adding an alternative ("or") to an existing step — inherit its equal flag.
      step = routeTargetStep
      const inStep = routeStops.filter((s) => s.step === step)
      position = inStep.length ? Math.max(...inStep.map((s) => s.position)) + 1 : 0
      equalOptions = inStep.some((s) => s.equalOptions)
    } else {
      // New step appended after the last one.
      step = routeStops.length ? Math.max(...routeStops.map((s) => s.step)) + 1 : 0
      position = 0
      equalOptions = false
    }
    setRouteStops((prev) => [...prev, { pin, step, position, equalOptions }])
    await supabase.from('route_pins').insert({ route_id: activeRouteId, pin_id: pin.id, step, position, equal_options: equalOptions })
  }, [activeRouteId, routeStops, routeTargetStep])

  const removeRouteStop = useCallback(async (pinId: string) => {
    if (!activeRouteId) return
    setRouteStops((prev) => prev.filter((s) => s.pin.id !== pinId))
    await supabase.from('route_pins').delete().eq('route_id', activeRouteId).eq('pin_id', pinId)
  }, [activeRouteId])

  // Move a whole STEP (with all its alternatives) up or down by swapping step
  // numbers with the adjacent step.
  const moveRouteStep = useCallback(async (step: number, dir: -1 | 1) => {
    if (!activeRouteId) return
    const orderedSteps = [...new Set(routeStops.map((s) => s.step))].sort((a, b) => a - b)
    const idx = orderedSteps.indexOf(step)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= orderedSteps.length) return
    const other = orderedSteps[j]
    setRouteStops((prev) =>
      prev.map((s) => (s.step === step ? { ...s, step: other } : s.step === other ? { ...s, step } : s)))
    await Promise.all([
      supabase.from('route_pins').update({ step: other }).eq('route_id', activeRouteId).in('pin_id', routeStops.filter((s) => s.step === step).map((s) => s.pin.id)),
      supabase.from('route_pins').update({ step }).eq('route_id', activeRouteId).in('pin_id', routeStops.filter((s) => s.step === other).map((s) => s.pin.id)),
    ])
  }, [activeRouteId, routeStops])

  // Toggle a step's "equal options" flag (all its options drawn as equal dashed
  // branches off the previous stop, vs. one solid default + dashed fallbacks).
  // Persisted on every row of the step so grouping stays consistent.
  const toggleEqualOptions = useCallback(async (step: number) => {
    if (!activeRouteId) return
    const next = !routeStops.some((s) => s.step === step && s.equalOptions)
    setRouteStops((prev) => prev.map((s) => (s.step === step ? { ...s, equalOptions: next } : s)))
    await supabase
      .from('route_pins')
      .update({ equal_options: next })
      .eq('route_id', activeRouteId)
      .in('pin_id', routeStops.filter((s) => s.step === step).map((s) => s.pin.id))
  }, [activeRouteId, routeStops])

  return {
    routes,
    routeFolders,
    activeRouteId,
    routeStops,
    builderCommunityId,
    setBuilderCommunityId,
    routeTargetStep,
    setRouteTargetStep,
    externalRoute,
    routeGeometry,
    branchGeometry,
    selectRoute,
    openRouteById,
    closeRoute,
    setRouteMode,
    createRoute,
    renameRoute,
    publishRoute,
    updateRouteColor,
    deleteRoute,
    createRouteFolder,
    renameRouteFolder,
    deleteRouteFolder,
    assignRouteFolder,
    addPinToRoute,
    removeRouteStop,
    moveRouteStep,
    toggleEqualOptions,
  }
}
