'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Menu, Zap, LocateFixed, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthUser } from '@/hooks/useAuthUser'
import { useCommunities } from '@/hooks/useCommunities'
import { usePins } from '@/hooks/usePins'
import { useRouteBuilder, groupRouteSteps } from '@/hooks/useRouteBuilder'
import { Pin } from '@/lib/types'
import { selectVisiblePins } from '@/lib/pin-filters'
import { buildRouteLegs, stepsToLegSteps, normalizeSolidSegments } from '@/lib/route-legs'
import type { FlyToTarget } from '@/components/MapInner'
import Sidebar from '@/components/Sidebar'
import MapWrapper from '@/components/MapWrapper'
import LocationSearch from '@/components/LocationSearch'
import AddPinModal from '@/components/AddPinModal'
import PinDetailModal from '@/components/PinDetailModal'
import AuthModal from '@/components/AuthModal'
import CreateCommunityModal from '@/components/CreateCommunityModal'
import ImportPlacesModal from '@/components/ImportPlacesModal'
import CommunitySettingsModal from '@/components/CommunitySettingsModal'
import CommunityPinsPanel from '@/components/CommunityPinsPanel'
import RouteBuilder from '@/components/RouteBuilder'
import SearchModal from '@/components/SearchModal'
import BottomNav from '@/components/BottomNav'
import MapStyleSwitcher from '@/components/MapStyleSwitcher'
import QuickAddSheet from '@/components/QuickAddSheet'
import WelcomeModal from '@/components/WelcomeModal'
import { useMapStyle } from '@/hooks/useMapStyle'

export default function Home() {
  const { user, authReady, myUsername, isAdmin } = useAuthUser()
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [communitySettingsId, setCommunitySettingsId] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null)
  const flyToCounter = useRef(0)
  // Tracks whether user has manually chosen a filter; prevents auto-default from overriding choices
  const userChoseFilter = useRef(false)

  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null)
  const [showSubscribedOnly, setShowSubscribedOnly] = useState(false)
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  // Per-community map visibility (device preference; independent of subscribe)
  const [hiddenCommunityIds, setHiddenCommunityIds] = useState<Set<string>>(new Set())
  const [pendingLatLng, setPendingLatLng] = useState<[number, number] | null>(null)
  const [pendingCommunityOverride, setPendingCommunityOverride] = useState<string | null>(null)
  const [pendingPinTitle, setPendingPinTitle] = useState<string | null>(null)
  const [mapCenter, setMapCenter] = useState<[number, number]>([30, 10]) // matches MapInner initial center
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null)

  // Communities + the user's relationship to them — see hooks/useCommunities.
  const {
    communities,
    subscribedIds,
    modCommunityIds,
    ownedCommunityIds,
    moderatedIds,
    canModerate,
    pendingInvites,
    groups,
    communityGroupMap,
    refetchCommunities: fetchCommunities,
    subscribe,
    unsubscribe,
    acceptInvite: handleAcceptInvite,
    declineInvite: handleDeclineInvite,
    createGroup: handleCreateGroup,
    renameGroup: handleRenameGroup,
    deleteGroup: handleDeleteGroup,
    assignGroup: handleAssignGroup,
    applyCommunityPatch,
    removeCommunity,
  } = useCommunities(user)

  // Pins + the user's saved bookmarks and follow graph — see hooks/usePins.
  const {
    pins,
    refetchPins: fetchPins,
    savedPinIds,
    toggleSave,
    followedUserIds,
    toggleFollow,
    removePin,
    applyPinPatch,
  } = usePins(user)

  // The custom community folder currently filtering the map (null = none)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  // Routes / trails — the whole builder lives in hooks/useRouteBuilder. Opening a
  // route hands the map to the builder (clear the community filter, close the drawer).
  const {
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
    selectRoute: handleSelectRoute,
    openRouteById: handleOpenRouteById,
    closeRoute: handleCloseRoute,
    setRouteMode: handleSetRouteMode,
    createRoute: handleCreateRoute,
    renameRoute: handleRenameRoute,
    publishRoute: handlePublishRoute,
    updateRouteColor: handleUpdateRouteColor,
    deleteRoute: handleDeleteRoute,
    createRouteFolder: handleCreateRouteFolder,
    renameRouteFolder: handleRenameRouteFolder,
    deleteRouteFolder: handleDeleteRouteFolder,
    assignRouteFolder: handleAssignRouteFolder,
    addPinToRoute: handleAddPinToRoute,
    removeRouteStop: handleRemoveRouteStop,
    moveRouteStep: handleMoveRouteStep,
    toggleEqualOptions: handleToggleEqualOptions,
  } = useRouteBuilder(user, {
    onEnterBuilder: () => { setSelectedCommunity(null); setShowMobileSidebar(false) },
  })
  // Which list the sidebar shows — lifted here so the bottom nav can switch it
  const [sidebarTab, setSidebarTab] = useState<'communities' | 'feed'>('communities')
  // Map tile style (light/dark/satellite), persisted — see hooks/useMapStyle.
  const { mapStyle, changeMapStyle } = useMapStyle()
  // Tag filter (community-scoped) — empty = show all
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())

  // Load persisted hidden-community set on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('hiddenCommunityIds') ?? '[]')
      if (Array.isArray(saved)) setHiddenCommunityIds(new Set(saved))
    } catch { /* ignore */ }
  }, [])

  const handleToggleCommunityVisibility = (id: string) => {
    setHiddenCommunityIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem('hiddenCommunityIds', JSON.stringify([...next]))
      return next
    })
  }

  // Auth (user / authReady / myUsername / isAdmin) lives in hooks/useAuthUser.
  // Close the auth modal once a session is established.
  useEffect(() => { if (user) setShowAuthModal(false) }, [user])

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch((v) => !v)
      }
      if (e.key === 'Escape') setShowSearch(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Pin/saved/follow data lives in hooks/usePins; routes + folders in
  // hooks/useRouteBuilder. Both clear themselves on sign-out.

  // Reset manual-filter flag when auth changes, and clear map-filter views on
  // sign-out (route/community-owned state clears in their own hooks).
  useEffect(() => {
    userChoseFilter.current = false
    if (!user) {
      setShowSubscribedOnly(false)
      setShowSavedOnly(false)
      setActiveFolderId(null)
      setSelectedCommunity(null)
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-default logged-in users with subscriptions to the subscribed-only view
  useEffect(() => {
    if (userChoseFilter.current) return
    if (user && subscribedIds.size > 0) {
      setShowSubscribedOnly(true)
      setSelectedCommunity(null)
    }
  }, [user, subscribedIds]) // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the Saved view automatically once the last save is removed
  useEffect(() => {
    if (showSavedOnly && savedPinIds.size === 0) setShowSavedOnly(false)
  }, [showSavedOnly, savedPinIds])

  // Pin fetching + realtime live in hooks/usePins (fetchPins == refetchPins).

  // First visit: one-time welcome (localStorage), unless the visitor arrived on
  // a ?pin=/?route= deep link — never cover what someone was sent to see.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('pin') || params.get('route')) return
    try {
      if (!localStorage.getItem('mapcrowd.welcomeSeen')) setShowWelcome(true)
    } catch {
      // storage unavailable — skip rather than show on every visit
    }
  }, [])

  const closeWelcome = useCallback(() => {
    setShowWelcome(false)
    try {
      localStorage.setItem('mapcrowd.welcomeSeen', '1')
    } catch {}
  }, [])

  // Deep link: /?pin=<id> opens that pin and flies to it (once, on mount)
  useEffect(() => {
    const pinId = new URLSearchParams(window.location.search).get('pin')
    if (!pinId) return
    supabase
      .from('pins')
      .select('*, community:communities(*), profile:profiles(username, avatar_url), pin_tags(tag_id)')
      .eq('id', pinId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        const { pin_tags, ...rest } = data as Pin & { pin_tags?: { tag_id: string }[] }
        const pin = { ...rest, tag_ids: (pin_tags ?? []).map((t) => t.tag_id) } as Pin
        setSelectedPin(pin)
        handleFlyTo(pin.lat, pin.lng, 16)
        // Clean the query string so a refresh/back doesn't reopen it
        window.history.replaceState({}, '', window.location.pathname)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Deep link: /?route=<id> opens a route (read-only unless you own it, via
  // handleOpenRouteById). RLS lets anyone read a public route + its stops.
  useEffect(() => {
    const routeId = new URLSearchParams(window.location.search).get('route')
    if (!routeId) return
    handleOpenRouteById(routeId)
    window.history.replaceState({}, '', window.location.pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The debounced ORS snapped-geometry recompute lives in hooks/useRouteBuilder.

  // ── Interaction handlers ──────────────────────────────────────────────────

  // Clear every map-filter dimension. Each filter handler calls this, then sets
  // its own — so the views stay mutually exclusive and adding a new filter only
  // needs one line here (not a line in every handler).
  const resetMapFilters = () => {
    userChoseFilter.current = true
    setSelectedCommunity(null)
    setShowSubscribedOnly(false)
    setShowSavedOnly(false)
    setActiveFolderId(null)
    handleCloseRoute()
    setSelectedTagIds(new Set())
  }

  const handleSelectCommunity = (id: string | null) => {
    resetMapFilters()
    setSelectedCommunity(id)
    // On mobile, any deliberate view choice closes the drawer so the map/panel shows.
    setShowMobileSidebar(false)
  }

  const handleShowSubscribed = () => {
    resetMapFilters()
    setShowSubscribedOnly(true)
    setShowMobileSidebar(false)
  }

  const handleShowSaved = () => {
    resetMapFilters()
    setShowSavedOnly(true)
    setShowMobileSidebar(false)
  }

  // Filter the map to a custom community folder (the union of its communities' pins).
  const handleSelectFolder = (id: string) => {
    resetMapFilters()
    setActiveFolderId(id)
    setShowMobileSidebar(false)
  }

  // Community ids belonging to the active folder (via the community→group map).
  const activeFolderCommunityIds = useMemo(() => {
    if (!activeFolderId) return null
    const ids = new Set<string>()
    for (const [cid, gid] of communityGroupMap) if (gid === activeFolderId) ids.add(cid)
    return ids
  }, [activeFolderId, communityGroupMap])

  const filteredPins = useMemo(
    () => selectVisiblePins({
      pins,
      selectedCommunity,
      activeFolderId,
      activeFolderCommunityIds,
      showSubscribedOnly,
      subscribedIds,
      showSavedOnly,
      savedPinIds,
      hiddenCommunityIds,
      selectedTagIds,
    }),
    [pins, selectedCommunity, activeFolderId, activeFolderCommunityIds, showSubscribedOnly, subscribedIds, showSavedOnly, savedPinIds, hiddenCommunityIds, selectedTagIds]
  )

  // Route CRUD + stop editing (select/open/close, mode, create/rename/publish/
  // color/delete, folder CRUD, add/remove/move/toggle-equal stops) all live in
  // hooks/useRouteBuilder and are destructured above with their handle* names.

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  const handleMapClick = (lat: number, lng: number) => {
    if (activeRouteId) return // a route is open — empty-map taps shouldn't drop a pin
    if (selectedPin) { setSelectedPin(null); return }
    setPendingLatLng([lat, lng])
  }

  const handlePinClick = (pin: Pin) => {
    // While editing a route, tapping a pin appends it as a stop instead of opening
    // its detail. Routes in `routes` state are always owned (fetchRoutes filters by
    // user_id); a read-only public viewer falls through to normal pin detail.
    if (activeRouteId && routes.some((r) => r.id === activeRouteId)) { handleAddPinToRoute(pin); return }
    setPendingLatLng(null)
    setSelectedPin(pin)
  }

  const handleAddPinForCommunity = (communityId: string) => {
    setPendingCommunityOverride(communityId)
    setPendingLatLng([mapCenter[0], mapCenter[1]])
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  // Subscribe/unsubscribe primitives live in useCommunities; this wrapper adds the
  // map-filter side-effect (leaving the subscribed-only view when the last sub goes).
  const handleToggleSubscription = async (communityId: string) => {
    if (!user) { setShowAuthModal(true); return }
    if (subscribedIds.has(communityId)) {
      await unsubscribe(communityId)
      if (subscribedIds.size === 1 && showSubscribedOnly) {
        setShowSubscribedOnly(false)
        userChoseFilter.current = false // allow auto-default to re-activate on re-subscribe
      }
    } else {
      await subscribe(communityId)
    }
  }

  // Save/follow toggles: gate the sign-in prompt here, then defer to usePins.
  const handleToggleFollow = async (targetUserId: string) => {
    if (!user) { setShowAuthModal(true); return }
    await toggleFollow(targetUserId)
  }

  const handleToggleSave = async (pinId: string) => {
    if (!user) { setShowAuthModal(true); return }
    await toggleSave(pinId)
  }

  // Following feed → fly to the pin and open its detail
  const handleSelectPin = (pin: Pin) => {
    handleFlyTo(pin.lat, pin.lng, 16)
    setSelectedPin(pin)
    setShowMobileSidebar(false)
  }

  const handleCenterChange = useCallback((lat: number, lng: number) => {
    setMapCenter([lat, lng])
  }, [])

  const handleFlyTo = (lat: number, lng: number, zoom: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return // ignore bad coords
    flyToCounter.current += 1
    setFlyToTarget({ lat, lng, zoom, id: flyToCounter.current })
  }

  const handleDeletePin = async (pinId: string) => {
    await removePin(pinId)
    setSelectedPin(null)
  }

  // Reflect an edited pin (title/description/url) in both the list (via usePins)
  // and the open modal (selectedPin stays in the page as coordination state).
  const handleUpdatePin = (updated: Partial<Pin> & { id: string }) => {
    applyPinPatch(updated)
    setSelectedPin((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev))
  }

  // Community group CRUD (create/rename/delete/assign) lives in useCommunities.

  // ── Near Me ───────────────────────────────────────────────────────────────
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported')
      setTimeout(() => setLocationError(null), 3000)
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        handleFlyTo(coords.latitude, coords.longitude, 14)
        setLocating(false)
      },
      (err) => {
        setLocationError(
          err.code === 1 ? 'Location access denied' :
          err.code === 2 ? 'Location unavailable' : 'Location timed out'
        )
        setLocating(false)
        setTimeout(() => setLocationError(null), 3000)
      },
      { timeout: 10000, maximumAge: 60000 }
    )
  }

  // Mobile FAB — opens the quick-add sheet (GPS + nearby place suggestions)
  const handleFabAddPin = () => setShowQuickAdd(true)

  // Quick-add → "More options": hand off to the full Add Pin modal, pre-filled
  const handleQuickAddMore = (lat: number, lng: number, title: string, communityId: string | null) => {
    setShowQuickAdd(false)
    setPendingCommunityOverride(communityId)
    setPendingPinTitle(title || null)
    setPendingLatLng([lat, lng])
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const settingsCommunity = communitySettingsId
    ? communities.find((c) => c.id === communitySettingsId) ?? null
    : null

  const selectedCommunityObj = selectedCommunity
    ? communities.find((c) => c.id === selectedCommunity) ?? null
    : null

  // ── Overlay bookkeeping ───────────────────────────────────────────────────
  // panelOpen  = the community side panel / bottom sheet (non-blocking on desktop)
  // modalOpen  = a blocking modal/sheet that should own the screen
  // When either is up, the floating map controls hide so nothing overlaps.
  // The route builder owns the whole map area, so it behaves like a blocking
  // modal (hides floating controls AND unmounts LocationSearch).
  const routeBuilderOpen = !!activeRouteId
  const panelOpen = !!selectedCommunityObj
  const modalOpen =
    !!pendingLatLng || !!selectedPin || showAuthModal || showSearch ||
    showCreateModal || showImportModal || !!communitySettingsId || showQuickAdd || routeBuilderOpen ||
    showWelcome
  const overlayOpen = panelOpen || modalOpen

  // Active route → ordered polyline path for the map
  const activeRoute = activeRouteId
    ? routes.find((r) => r.id === activeRouteId) ?? (externalRoute?.id === activeRouteId ? externalRoute : null)
    : null
  // Only the owner can edit; a public route opened by someone else is view-only.
  const routeCanEdit = !!activeRoute && !!user && activeRoute.user_id === user.id
  // Steps drive both the solid main path and the dashed "or" spurs to alternatives.
  const routeStepGroups = groupRouteSteps(routeStops)
  // Derive the straight-line legs (solid runs + dashed spurs) from the current
  // stops — the fallback when no snapped geometry is available yet.
  const { solidRuns: straightSolid, dashedLegs: straightDashed } =
    buildRouteLegs(stepsToLegSteps(routeStepGroups))
  // Prefer the snapped geometry (this session's recompute, else stored); fall back
  // to straight lines. Stored geometry is normalised (legacy = one flat polyline).
  const routeSolidSegments: [number, number][][] =
    routeGeometry ?? normalizeSolidSegments(activeRoute?.geometry) ?? straightSolid
  const routeBranchLegs: [number, number][][] =
    branchGeometry ?? activeRoute?.branch_geometry ?? straightDashed.map((l) => [l.from, l.to])

  // While a route is open, ALWAYS show its stop pins as markers (so the line never
  // points at invisible pins) — unioned with whatever else is browsable: the
  // selected community (owner "From community"), everything (owner otherwise), or
  // nothing extra (read-only viewer).
  const mapPins = useMemo(() => {
    if (!activeRoute) return filteredPins
    const stopPins = routeStops.map((s) => s.pin)
    const base = !routeCanEdit
      ? []
      : builderCommunityId
        ? pins.filter((p) => p.community_id === builderCommunityId)
        : pins
    const seen = new Set(base.map((p) => p.id))
    return [...base, ...stopPins.filter((p) => !seen.has(p.id))]
  }, [activeRoute, routeCanEdit, builderCommunityId, pins, routeStops, filteredPins])

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">
      <Sidebar
        communities={communities}
        pins={pins}
        selectedCommunity={selectedCommunity}
        showSubscribedOnly={showSubscribedOnly}
        showSavedOnly={showSavedOnly}
        savedCount={savedPinIds.size}
        activeFolderId={activeFolderId}
        onSelectFolder={handleSelectFolder}
        routes={routes}
        activeRouteId={activeRouteId}
        onSelectRoute={handleSelectRoute}
        onCreateRoute={handleCreateRoute}
        onDeleteRoute={handleDeleteRoute}
        routeFolders={routeFolders}
        onCreateRouteFolder={handleCreateRouteFolder}
        onRenameRouteFolder={handleRenameRouteFolder}
        onDeleteRouteFolder={handleDeleteRouteFolder}
        onAssignRouteFolder={handleAssignRouteFolder}
        subscribedIds={subscribedIds}
        hiddenCommunityIds={hiddenCommunityIds}
        onToggleCommunityVisibility={handleToggleCommunityVisibility}
        ownedCommunityIds={ownedCommunityIds}
        modCommunityIds={modCommunityIds}
        onSelectCommunity={handleSelectCommunity}
        onShowSubscribed={handleShowSubscribed}
        onShowSaved={handleShowSaved}
        onToggleSubscription={handleToggleSubscription}
        onOpenSettings={setCommunitySettingsId}
        onAddPin={handleAddPinForCommunity}
        onOpenSearch={() => setShowSearch(true)}
        groups={groups}
        communityGroupMap={communityGroupMap}
        followedUserIds={followedUserIds}
        onSelectPin={handleSelectPin}
        tab={sidebarTab}
        onTabChange={setSidebarTab}
        onCreateGroup={handleCreateGroup}
        onRenameGroup={handleRenameGroup}
        onDeleteGroup={handleDeleteGroup}
        onAssignGroup={handleAssignGroup}
        pendingInvites={pendingInvites}
        onAcceptInvite={handleAcceptInvite}
        onDeclineInvite={handleDeclineInvite}
        mobileOpen={showMobileSidebar}
        onMobileClose={() => setShowMobileSidebar(false)}
        onShowWelcome={() => { setShowMobileSidebar(false); setShowWelcome(true) }}
        user={user}
        authReady={authReady}
        onSignIn={() => setShowAuthModal(true)}
        onSignOut={handleSignOut}
        onCreateCommunity={() => setShowCreateModal(true)}
        onImportPlaces={() => setShowImportModal(true)}
        isAdmin={isAdmin}
      />

      <main className="relative flex-1 overflow-hidden">
        {/* Hamburger — mobile only; hidden whenever any overlay owns the screen */}
        <button
          onClick={() => setShowMobileSidebar(true)}
          className={`fixed left-4 top-4 z-[1100] flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-lg border border-gray-200 text-gray-700 hover:text-gray-900 transition-colors ${overlayOpen ? 'hidden' : 'md:hidden'}`}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Mobile quick-add FAB — extended pill so it reads as "Quick add", not a
            generic "add pin". Hidden on md+ and whenever an overlay is open. */}
        {!overlayOpen && (
          <button
            onClick={handleFabAddPin}
            aria-label="Quick add a pin near you"
            className="fixed bottom-36 right-4 z-[1100] flex h-12 items-center gap-2 rounded-full bg-indigo-600 pl-4 pr-5 text-sm font-semibold text-white shadow-xl transition-transform active:scale-95 hover:bg-indigo-500 md:bottom-28 md:hidden"
          >
            <Zap className="h-5 w-5" />
            Quick add
          </button>
        )}

        {/* Location / geocoding search — top right of map.
            Unmounted while a blocking modal is open so it can't float over a sheet. */}
        {!modalOpen && (
          <LocationSearch
            onFlyTo={handleFlyTo}
            panelOpen={panelOpen}
            onAddPin={(lat, lng, name) => {
              setPendingLatLng([lat, lng])
              setPendingPinTitle(name)
            }}
          />
        )}

        {/* Near me — bottom-right of map; hidden when any overlay is open */}
        {!overlayOpen && (
          <div className="absolute right-4 bottom-20 z-[1100] flex flex-col items-end gap-2 md:bottom-8">
            {locationError && (
              <div className="rounded-lg border border-red-500/30 bg-white px-3 py-1.5 text-xs text-red-500 shadow-lg">
                {locationError}
              </div>
            )}
            <button
              onClick={handleNearMe}
              disabled={locating}
              title="Fly to my location"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-lg transition-colors hover:border-indigo-500 hover:text-gray-900 disabled:opacity-50"
            >
              {locating
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <LocateFixed className="h-4 w-4" />}
            </button>
          </div>
        )}

        {/* Map style switcher — bottom-left of map. Hidden under blocking modals;
            with just a community panel open it stays on desktop (it's bottom-left,
            clear of the right-hand panel) but hides on mobile (the sheet covers it). */}
        {!modalOpen && (
          <div className={`absolute left-4 bottom-20 z-[1100] md:bottom-8 ${panelOpen ? 'hidden md:block' : ''}`}>
            <MapStyleSwitcher value={mapStyle} onChange={changeMapStyle} />
          </div>
        )}

        <MapWrapper
          pins={mapPins}
          communities={communities}
          onMapClick={handleMapClick}
          onPinClick={handlePinClick}
          flyToTarget={flyToTarget}
          onCenterChange={handleCenterChange}
          followedUserIds={followedUserIds}
          mapStyle={mapStyle}
          routeSolidSegments={routeSolidSegments}
          routeColor={activeRoute?.color}
          routeBranchLegs={routeBranchLegs}
        />

        {activeRoute && (
          <RouteBuilder
            route={activeRoute}
            steps={routeStepGroups}
            communities={communities}
            pins={pins}
            canEdit={routeCanEdit}
            authorName={activeRoute.profile?.username ?? undefined}
            targetStep={routeTargetStep}
            onSetTargetStep={setRouteTargetStep}
            onSelectBuilderCommunity={setBuilderCommunityId}
            onAddPin={handleAddPinToRoute}
            onRemoveStop={handleRemoveRouteStop}
            onMoveStep={handleMoveRouteStep}
            onToggleEqualOptions={handleToggleEqualOptions}
            onFlyToPin={(pin) => handleFlyTo(pin.lat, pin.lng, 16)}
            onRename={handleRenameRoute}
            onUpdateColor={handleUpdateRouteColor}
            onUpdateMode={handleSetRouteMode}
            onPublish={handlePublishRoute}
            onDelete={handleDeleteRoute}
            onClose={handleCloseRoute}
          />
        )}

        {selectedCommunityObj && !activeRoute && (
          <CommunityPinsPanel
            community={selectedCommunityObj}
            pins={filteredPins}
            selectedTagIds={selectedTagIds}
            onToggleTag={toggleTagFilter}
            onClose={() => handleSelectCommunity(null)}
            onPinClick={handlePinClick}
            onAddPin={handleAddPinForCommunity}
            onOpenRoute={handleOpenRouteById}
          />
        )}

        {showCreateModal && user && (
          <CreateCommunityModal
            userId={user.id}
            onClose={() => setShowCreateModal(false)}
            onSuccess={(newId) => {
              setShowCreateModal(false)
              fetchCommunities()
              // If a pin is mid-drop, select the new community in that form
              // (don't disturb the map behind it); otherwise jump the map to it.
              if (pendingLatLng) setPendingCommunityOverride(newId)
              else handleSelectCommunity(newId)
            }}
          />
        )}

        {showImportModal && user && (
          <ImportPlacesModal
            userId={user.id}
            onClose={() => setShowImportModal(false)}
            onSuccess={(newId) => {
              setShowImportModal(false)
              fetchCommunities()
              fetchPins()
              handleSelectCommunity(newId)
            }}
          />
        )}

        {showWelcome && <WelcomeModal onClose={closeWelcome} />}

        {showAuthModal && !user && (
          <AuthModal
            onClose={() => {
              setShowAuthModal(false)
              setPendingLatLng(null)
            }}
            onSuccess={() => setShowAuthModal(false)}
          />
        )}

        {pendingLatLng && !showAuthModal && (
          <AddPinModal
            lat={pendingLatLng[0]}
            lng={pendingLatLng[1]}
            communities={communities}
            initialCommunityId={pendingCommunityOverride ?? selectedCommunity}
            initialTitle={pendingPinTitle ?? undefined}
            userId={user?.id ?? null}
            subscribedIds={subscribedIds}
            moderatedIds={moderatedIds}
            onClose={() => { setPendingLatLng(null); setPendingCommunityOverride(null); setPendingPinTitle(null) }}
            onSuccess={() => { setPendingLatLng(null); setPendingCommunityOverride(null); setPendingPinTitle(null); fetchPins() }}
            onSignIn={() => { setShowAuthModal(true) }}
            onCreateCommunity={() => setShowCreateModal(true)}
            selectCommunityId={pendingCommunityOverride}
          />
        )}

        {showQuickAdd && !showAuthModal && (
          <QuickAddSheet
            communities={communities}
            userId={user?.id ?? null}
            subscribedIds={subscribedIds}
            moderatedIds={moderatedIds}
            preferredCommunityId={selectedCommunity}
            onClose={() => setShowQuickAdd(false)}
            onSuccess={() => { setShowQuickAdd(false); fetchPins() }}
            onSignIn={() => setShowAuthModal(true)}
            onMoreOptions={handleQuickAddMore}
          />
        )}

        {selectedPin && (
          <PinDetailModal
            pin={selectedPin}
            user={user}
            canDelete={
              !!user && (
                user.id === selectedPin.user_id ||
                canModerate(selectedPin.community_id)
              )
            }
            isModerator={!!user && canModerate(selectedPin.community_id)}
            onClose={() => setSelectedPin(null)}
            onVoteUpdate={(updated) => {
              applyPinPatch(updated)
              setSelectedPin((prev) => (prev ? { ...prev, ...updated } : null))
            }}
            onDeletePin={handleDeletePin}
            onUpdatePin={handleUpdatePin}
            onSignIn={() => setShowAuthModal(true)}
            onGoToPin={() => {
              handleFlyTo(selectedPin.lat, selectedPin.lng, 17)
            }}
            followedUserIds={followedUserIds}
            onToggleFollow={handleToggleFollow}
            isSaved={savedPinIds.has(selectedPin.id)}
            onToggleSave={handleToggleSave}
          />
        )}

        {showSearch && (
          <SearchModal
            communities={communities}
            onSelectCommunity={(id) => { handleSelectCommunity(id); setShowSearch(false) }}
            onSelectPin={(pin) => { setSelectedPin(pin); setShowSearch(false) }}
            onClose={() => setShowSearch(false)}
          />
        )}

        {settingsCommunity && user && (
          <CommunitySettingsModal
            community={settingsCommunity}
            currentUserId={user.id}
            isOwner={settingsCommunity.created_by === user.id}
            isAdmin={isAdmin}
            onClose={() => setCommunitySettingsId(null)}
            onSettingsUpdate={(updated) => applyCommunityPatch(settingsCommunity.id, updated)}
            onDelete={() => {
              removeCommunity(settingsCommunity.id)
              if (selectedCommunity === settingsCommunity.id) setSelectedCommunity(null)
              setCommunitySettingsId(null)
            }}
          />
        )}

        {/* Persistent bottom nav — mobile only; hidden while an overlay owns the screen */}
        {!overlayOpen && (
          <BottomNav
            username={myUsername}
            onMap={() => { setSelectedPin(null); handleSelectCommunity(null); setShowMobileSidebar(false) }}
            onFeed={() => { setSidebarTab('feed'); setShowMobileSidebar(true) }}
            onSignIn={() => setShowAuthModal(true)}
          />
        )}
      </main>
    </div>
  )
}
