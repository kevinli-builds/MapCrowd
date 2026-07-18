'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Bookmark, BookmarkCheck, Check, ChevronDown, ChevronRight,
  Compass, Folder, FolderPlus, LogOut, Lock, MapPin, Pencil, Plus,
  Search, Settings, Shield, Trash2, User2, ArrowUpRight, X, Newspaper, Route as RouteIcon,
  Eye, EyeOff, Globe, HelpCircle,
} from 'lucide-react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { Community, CommunityGroup, Pin, PendingInvite, Route, RouteFolder } from '@/lib/types'
import Avatar from '@/components/Avatar'
import ActivityFeed from '@/components/ActivityFeed'

export type { PendingInvite }

function displayName(user: User): string {
  return (
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email?.split('@')[0] ??
    'User'
  )
}

interface SidebarProps {
  communities: Community[]
  pins: Pin[]
  selectedCommunity: string | null
  showSubscribedOnly: boolean
  showSavedOnly: boolean
  savedCount: number
  /** Communities whose pins are hidden from the map (device preference) */
  hiddenCommunityIds: Set<string>
  onToggleCommunityVisibility: (id: string) => void
  /** Custom community folder currently filtering the map (null = none) */
  activeFolderId: string | null
  onSelectFolder: (id: string) => void
  routes: Route[]
  activeRouteId: string | null
  onSelectRoute: (id: string) => void
  onCreateRoute: (name: string) => Promise<Route | null>
  onDeleteRoute: (id: string) => void
  routeFolders: RouteFolder[]
  onCreateRouteFolder: (name: string) => void
  onRenameRouteFolder: (id: string, name: string) => void
  onDeleteRouteFolder: (id: string) => void
  onAssignRouteFolder: (routeId: string, folderId: string | null) => void
  subscribedIds: Set<string>
  ownedCommunityIds: Set<string>
  modCommunityIds: Set<string>
  pendingInvites: PendingInvite[]
  groups: CommunityGroup[]
  communityGroupMap: Map<string, string | null>
  /** User IDs the current user follows — drives the Following feed */
  followedUserIds: Set<string>
  /** Fly to + open a pin (used by the Following feed) */
  onSelectPin: (pin: Pin) => void
  /** Which list the sidebar shows — controlled by the parent so the bottom nav can switch it */
  tab: 'communities' | 'feed'
  onTabChange: (tab: 'communities' | 'feed') => void
  onSelectCommunity: (id: string | null) => void
  onShowSubscribed: () => void
  onShowSaved: () => void
  onToggleSubscription: (id: string) => void
  onOpenSettings: (id: string) => void
  onAddPin: (communityId: string) => void
  onAcceptInvite: (memberId: string) => void
  onDeclineInvite: (memberId: string) => void
  onCreateGroup: (name: string) => Promise<string | null>
  onRenameGroup: (id: string, name: string) => void
  onDeleteGroup: (id: string) => void
  onAssignGroup: (communityId: string, groupId: string | null) => void
  user: User | null
  authReady: boolean
  onSignIn: () => void
  onSignOut: () => void
  onCreateCommunity: () => void
  onOpenSearch: () => void
  mobileOpen: boolean
  onMobileClose: () => void
  isAdmin?: boolean
  onShowWelcome?: () => void
}

export default function Sidebar({
  communities,
  pins,
  selectedCommunity,
  showSubscribedOnly,
  showSavedOnly,
  savedCount,
  hiddenCommunityIds,
  onToggleCommunityVisibility,
  activeFolderId,
  onSelectFolder,
  routes,
  activeRouteId,
  onSelectRoute,
  onCreateRoute,
  onDeleteRoute,
  routeFolders,
  onCreateRouteFolder,
  onRenameRouteFolder,
  onDeleteRouteFolder,
  onAssignRouteFolder,
  subscribedIds,
  ownedCommunityIds,
  modCommunityIds,
  pendingInvites,
  groups,
  communityGroupMap,
  followedUserIds,
  onSelectPin,
  tab,
  onTabChange,
  onSelectCommunity,
  onShowSubscribed,
  onShowSaved,
  onToggleSubscription,
  onOpenSettings,
  onAddPin,
  onAcceptInvite,
  onDeclineInvite,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onAssignGroup,
  user,
  authReady,
  onSignIn,
  onSignOut,
  onCreateCommunity,
  onOpenSearch,
  mobileOpen,
  onMobileClose,
  isAdmin = false,
  onShowWelcome,
}: SidebarProps) {
  // ── Local UI state ──────────────────────────────────────────────────────
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  // All Routes auto-folder — collapsed by default
  const [allRoutesOpen, setAllRoutesOpen] = useState(false)

  // ── Resizable sidebar (desktop only; mobile stays a fixed-width drawer) ────
  const MIN_SIDEBAR_W = 240
  const MAX_SIDEBAR_W = 520
  const clampSidebarW = (n: number) => Math.min(MAX_SIDEBAR_W, Math.max(MIN_SIDEBAR_W, n))
  const asideRef      = useRef<HTMLElement>(null)
  const resizingRef   = useRef(false)
  const [sidebarWidth, setSidebarWidth] = useState(288) // w-72 default

  // Restore persisted width on mount
  useEffect(() => {
    const saved = Number(localStorage.getItem('mapcrowd:sidebarWidth'))
    if (saved) setSidebarWidth(clampSidebarW(saved))
  }, [])

  // Drag-to-resize: width tracks the cursor's distance from the sidebar's left edge
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current || !asideRef.current) return
      const left = asideRef.current.getBoundingClientRect().left
      setSidebarWidth(clampSidebarW(e.clientX - left))
    }
    const onUp = () => {
      if (!resizingRef.current) return
      resizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (asideRef.current) {
        localStorage.setItem('mapcrowd:sidebarWidth', String(Math.round(asideRef.current.getBoundingClientRect().width)))
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  const [groupPicker, setGroupPicker]         = useState<string | null>(null) // communityId
  const [pickerCreating, setPickerCreating]   = useState(false)
  const [pickerNewName, setPickerNewName]     = useState('')
  const [creatingGroup, setCreatingGroup]     = useState(false)
  const [newGroupName, setNewGroupName]       = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue]         = useState('')
  // Routes inline-create
  const [creatingRoute, setCreatingRoute] = useState(false)
  const [newRouteName, setNewRouteName]   = useState('')
  const submitNewRoute = async () => {
    const name = newRouteName.trim()
    setCreatingRoute(false)
    setNewRouteName('')
    if (name) {
      const r = await onCreateRoute(name)
      if (r) onSelectRoute(r.id) // open it so the user can start adding stops
    }
  }

  // Route folders — expansion (collapsed by default), create, rename, per-route move
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const toggleFolder = (id: string) =>
    setExpandedFolders((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const submitNewFolder = () => {
    const name = newFolderName.trim()
    setCreatingFolder(false); setNewFolderName('')
    if (name) onCreateRouteFolder(name)
  }
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [folderRename, setFolderRename] = useState('')
  const [folderMenuRouteId, setFolderMenuRouteId] = useState<string | null>(null)

  const renderRouteRow = (r: Route) => (
    <div key={r.id} className="group/route relative mb-0.5">
      <div className={`flex items-center rounded-lg transition-colors ${
        activeRouteId === r.id ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}>
        <button onClick={() => onSelectRoute(r.id)} className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-3 text-left">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: r.color + '22', border: `2px solid ${r.color}` }}>
            <RouteIcon className="h-3.5 w-3.5" style={{ color: r.color }} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
          {r.is_public && <Globe className="h-3.5 w-3.5 shrink-0 text-green-500" aria-label="Public" />}
        </button>
        {/* Move to folder (only when folders exist) */}
        {routeFolders.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); setFolderMenuRouteId((id) => (id === r.id ? null : r.id)) }}
            title="Move to folder"
            className="shrink-0 p-1 text-gray-500 transition-opacity hover:text-gray-700 md:opacity-0 md:group-hover/route:opacity-100"
          >
            <Folder className="h-3.5 w-3.5" />
          </button>
        )}
        {/* Delete */}
        <button
          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete the route “${r.name}”? This can't be undone.`)) onDeleteRoute(r.id) }}
          title="Delete route"
          className="shrink-0 p-1 pr-2 text-gray-500 transition-opacity hover:text-red-500 md:opacity-0 md:group-hover/route:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Inline "move to folder" picker (in normal flow so the scroll container never clips it) */}
      {folderMenuRouteId === r.id && (
        <div className="ml-9 mt-0.5 mb-1 rounded-lg border border-gray-200/70 bg-white/60 p-1">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Move to folder…</p>
          <button onClick={() => { onAssignRouteFolder(r.id, null); setFolderMenuRouteId(null) }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
            <span className="min-w-0 flex-1 truncate text-left">No folder</span>
            {!r.folder_id && <Check className="h-3.5 w-3.5" />}
          </button>
          {routeFolders.map((f) => (
            <button key={f.id} onClick={() => { onAssignRouteFolder(r.id, f.id); setFolderMenuRouteId(null) }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
              <Folder className="h-3.5 w-3.5 shrink-0 text-gray-500" />
              <span className="min-w-0 flex-1 truncate text-left">{f.name}</span>
              {r.folder_id === f.id && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // ── Helpers ─────────────────────────────────────────────────────────────
  const countFor    = (id: string) => pins.filter((p) => p.community_id === id).length
  const isOwner     = (id: string) => ownedCommunityIds.has(id)
  const isMod       = (id: string) => modCommunityIds.has(id)
  const isSubscribed= (id: string) => subscribedIds.has(id)

  // Hide pending-invite communities from the main list (shown in invite banner)
  const pendingCommunityIds = new Set(pendingInvites.map((i) => i.community_id))
  const visibleCommunities  = communities.filter((c) => !pendingCommunityIds.has(c.id))

  // The main list shows EVERY community, alphabetical — subscribing no longer pulls
  // a community out of it. Custom folders (and the All/Subscriptions filters) are
  // non-MECE overlays: a community can appear in the full list AND in a folder.
  const sortedCommunities = [...visibleCommunities].sort((a, b) => a.name.localeCompare(b.name))

  // Custom folders list their assigned members (independent of subscription state).
  const groupedMap = new Map<string, Community[]>(groups.map((g) => [g.id, []]))
  for (const c of sortedCommunities) {
    const gid = communityGroupMap.get(c.id) ?? null
    if (gid && groupedMap.has(gid)) groupedMap.get(gid)!.push(c)
  }

  // Pin counts for the filter rows
  const allPinCount        = pins.length
  const subscribedPinCount = pins.filter((p) => subscribedIds.has(p.community_id)).length

  // Is the map currently unfiltered (the "All Communities" filter is active)?
  const allActive = !selectedCommunity && !showSubscribedOnly && !showSavedOnly && !activeFolderId

  // ── Group helpers ────────────────────────────────────────────────────────
  const toggleCollapse = (id: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const startRename = (g: CommunityGroup) => {
    setRenamingGroupId(g.id)
    setRenameValue(g.name)
  }

  const commitRename = (id: string) => {
    const original = groups.find((g) => g.id === id)?.name
    if (renameValue.trim() && renameValue.trim() !== original) {
      onRenameGroup(id, renameValue.trim())
    }
    setRenamingGroupId(null)
  }

  const handleCreateGroupInline = async () => {
    const name = newGroupName.trim()
    setCreatingGroup(false)
    setNewGroupName('')
    if (name) await onCreateGroup(name)
  }

  const handlePickerCreate = async (communityId: string) => {
    const name = pickerNewName.trim()
    if (!name) return
    const newId = await onCreateGroup(name)
    if (newId) onAssignGroup(communityId, newId)
    setPickerNewName('')
    setPickerCreating(false)
    setGroupPicker(null)
  }

  // ── Community row renderer ───────────────────────────────────────────────
  const renderRow = (c: Community, inGroup = false) => {
    const active        = selectedCommunity === c.id
    const subscribed    = isSubscribed(c.id)
    const owner         = isOwner(c.id)
    const mod           = isMod(c.id)
    const hidden        = hiddenCommunityIds.has(c.id)
    const currentGroupId= communityGroupMap.get(c.id) ?? null
    const pickerOpen    = groupPicker === c.id

    return (
      <div key={c.id} className={`group mb-0.5 ${inGroup ? 'pl-4' : ''}`}>
        {/* ── Main row: button (flex-1) + action clusters in normal flow so a long
              name truncates to make room instead of running under the icons ── */}
        <div className={`relative flex items-center rounded-lg transition-colors ${
          active ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        } ${hidden ? 'opacity-45' : ''}`}>
          <button
            onClick={() => { setGroupPicker(null); onSelectCommunity(active ? null : c.id) }}
            className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left md:py-2"
          >
            <span
              className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
              style={{ backgroundColor: c.color + '22', border: `2px solid ${c.color}` }}
            >
              {c.icon}
              {subscribed && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-500" />
              )}
            </span>

            <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>

            {c.is_private && <Lock className="h-3 w-3 shrink-0 text-gray-400" />}
            {(owner || mod) && (
              <Shield
                className="h-3 w-3 shrink-0"
                style={{ color: owner ? c.color : '#9ca3af' }}
                aria-label={owner ? 'You own this community' : 'You are a moderator'}
              />
            )}
          </button>

          {/* ── Right cluster: mobile (always visible, in flow) ── */}
          <div className="flex shrink-0 items-center gap-0.5 pr-1 md:hidden">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCommunityVisibility(c.id) }}
              title={hidden ? 'Show pins on map' : 'Hide pins from map'}
              className={`rounded-lg p-2 transition-colors ${hidden ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            {subscribed && user && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setPickerCreating(false); setPickerNewName('')
                  setGroupPicker(pickerOpen ? null : c.id)
                }}
                title="Move to folder"
                className={`rounded-lg p-2 transition-colors ${
                  currentGroupId ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Folder className="h-4 w-4" />
              </button>
            )}
            {!c.is_private && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSubscription(c.id) }}
                title={subscribed ? 'Unsubscribe' : 'Subscribe'}
                className={`rounded-lg p-2 transition-colors ${
                  subscribed ? 'text-amber-500' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {subscribed ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
              </button>
            )}
            {(owner || mod || isAdmin) && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenSettings(c.id) }}
                title="Settings"
                className={`rounded-lg p-2 transition-colors ${
                  isAdmin && !owner && !mod ? 'text-red-500/60' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Settings className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* ── Right cluster: desktop (pin count → actions on hover, in flow) ── */}
          <div className="hidden shrink-0 items-center pr-2 md:flex">
            <span className={`rounded-full px-2 py-0.5 text-xs md:group-hover:hidden ${
              active ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {countFor(c.id)}
            </span>
            <div className="hidden items-center gap-0.5 md:group-hover:flex">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleCommunityVisibility(c.id) }}
                title={hidden ? 'Show pins on map' : 'Hide pins from map'}
                className={`rounded p-1 transition-colors ${hidden ? 'text-indigo-600 hover:text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              {subscribed && user && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setPickerCreating(false); setPickerNewName('')
                    setGroupPicker(pickerOpen ? null : c.id)
                  }}
                  title="Move to folder"
                  className={`rounded p-1 transition-colors ${
                    currentGroupId
                      ? 'text-indigo-600 hover:text-indigo-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Folder className="h-3.5 w-3.5" />
                </button>
              )}
              {!c.is_private && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleSubscription(c.id) }}
                  title={subscribed ? 'Unsubscribe' : 'Subscribe'}
                  className={`rounded p-1 transition-colors ${
                    subscribed ? 'text-amber-500 hover:text-amber-600' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {subscribed ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onAddPin(c.id) }}
                title="Drop a pin here"
                className="rounded p-1 text-gray-500 transition-colors hover:text-indigo-600"
              >
                <MapPin className="h-3.5 w-3.5" />
              </button>
              <Link
                href={`/c/${c.slug}`}
                onClick={(e) => e.stopPropagation()}
                title="View community page"
                className="rounded p-1 text-gray-500 transition-colors hover:text-gray-700"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              {(owner || mod || isAdmin) && (
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenSettings(c.id) }}
                  title={owner ? 'Community settings' : isAdmin && !mod ? 'Admin settings' : 'Moderation queue'}
                  className={`rounded p-1 transition-colors hover:text-gray-700 ${
                    isAdmin && !owner && !mod ? 'text-red-500/60 hover:text-red-500' : 'text-gray-500'
                  }`}
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Group picker (inline dropdown) ── */}
        {pickerOpen && (
          <div
            className="mx-1 mb-1 mt-0.5 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-1">
              {/* No folder option */}
              <button
                onClick={() => { onAssignGroup(c.id, null); setGroupPicker(null) }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-gray-100 ${
                  currentGroupId === null ? 'text-gray-900' : 'text-gray-600'
                }`}
              >
                <Folder className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                <span className="flex-1 text-left">No folder</span>
                {currentGroupId === null && <Check className="h-3 w-3 shrink-0 text-indigo-600" />}
              </button>

              {/* Existing folders */}
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => { onAssignGroup(c.id, g.id); setGroupPicker(null) }}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-gray-100 ${
                    currentGroupId === g.id ? 'text-gray-900' : 'text-gray-600'
                  }`}
                >
                  <Folder className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                  <span className="flex-1 truncate text-left">{g.name}</span>
                  {currentGroupId === g.id && <Check className="h-3 w-3 shrink-0 text-indigo-600" />}
                </button>
              ))}
            </div>

            {/* Create new folder from picker */}
            <div className="border-t border-gray-200">
              {!pickerCreating ? (
                <button
                  onClick={() => setPickerCreating(true)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                  New folder…
                </button>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2">
                  <FolderPlus className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                  <input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    type="text"
                    value={pickerNewName}
                    onChange={(e) => setPickerNewName(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') await handlePickerCreate(c.id)
                      if (e.key === 'Escape') { setPickerCreating(false); setPickerNewName('') }
                    }}
                    placeholder="Folder name…"
                    className="min-w-0 flex-1 bg-transparent text-xs text-gray-900 placeholder-gray-400 outline-none"
                  />
                  <button
                    onClick={() => handlePickerCreate(c.id)}
                    className="shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Auto-folder row: a leading chevron (expand) + a body button (filter the map).
  // `icon` is the full colored icon span; children render when open.
  const renderAutoFolder = (
    open: boolean, onToggle: () => void,
    active: boolean, onClick: () => void,
    icon: React.ReactNode, label: string, count: number,
    activeRow: string, activeBadge: string,
    children: React.ReactNode,
  ) => (
    <div className="mb-1">
      <div className={`flex items-center rounded-lg transition-colors ${active ? activeRow : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          title={open ? 'Collapse' : 'Expand'}
          className="flex h-9 shrink-0 items-center pl-2 pr-0.5 text-gray-500 transition-colors hover:text-gray-700"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-3 text-left">
          {icon}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${active ? activeBadge : 'bg-gray-100 text-gray-500'}`}>{count}</span>
        </button>
      </div>
      {open && <div className="mb-1 pl-2">{children}</div>}
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[1400] bg-black/30 md:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        ref={asideRef}
        style={{ '--sidebar-w': `${sidebarWidth}px` } as React.CSSProperties}
        className={`
        flex flex-col border-r border-gray-200 bg-white
        fixed inset-y-0 left-0 z-[1401] w-72 transition-transform duration-300
        md:relative md:z-auto md:w-[var(--sidebar-w)] md:translate-x-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Drag handle — desktop only; mobile is a fixed-width drawer */}
        <div
          onMouseDown={startResize}
          title="Drag to resize"
          className="absolute inset-y-0 -right-0.5 z-10 hidden w-1.5 cursor-col-resize hover:bg-indigo-500/40 md:block"
        />

        {/* ── Header ── */}
        <div className="border-b border-gray-200 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-lg">
              <MapPin className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-base font-bold leading-none text-gray-900">MapCrowd</h1>
              <p className="mt-0.5 text-xs text-gray-500">crowd-sourced maps</p>
            </div>
            <button
              onClick={onMobileClose}
              className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={onOpenSearch}
            className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-100/50 px-3 py-2 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400">⌘K</kbd>
          </button>

          {/* ── Communities / Following tab switcher ── */}
          <div className="mt-3 flex gap-1 rounded-lg bg-gray-100/60 p-1">
            <button
              onClick={() => onTabChange('communities')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                tab === 'communities' ? 'bg-gray-200 text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              Communities
            </button>
            <button
              onClick={() => onTabChange('feed')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                tab === 'feed' ? 'bg-gray-200 text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Newspaper className="h-3.5 w-3.5" />
              Feed
            </button>
          </div>
        </div>

        {/* ── Activity feed ── */}
        {tab === 'feed' && (
          <div className="flex-1 overflow-y-auto p-3">
            <ActivityFeed
              pins={pins}
              followedUserIds={followedUserIds}
              subscribedIds={subscribedIds}
              onSelectPin={onSelectPin}
              signedIn={!!user}
              onSignIn={onSignIn}
            />
          </div>
        )}

        {/* ── Community list ── */}
        {tab === 'communities' && (
        <div
          className="flex-1 overflow-y-auto p-3"
          onClick={() => setGroupPicker(null)}
        >
          {/* Section header */}
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Communities</p>
            {user && (
              <div className="flex items-center gap-1">
                {/* New folder button — only when user has at least one subscription */}
                {subscribedIds.size > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setCreatingGroup((v) => !v)
                      setNewGroupName('')
                    }}
                    title="New folder"
                    className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={onCreateCommunity}
                  title="Create a new community"
                  className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Inline create-folder input */}
          {creatingGroup && (
            <div className="mb-2 px-1" onClick={(e) => e.stopPropagation()}>
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') await handleCreateGroupInline()
                  if (e.key === 'Escape') { setCreatingGroup(false); setNewGroupName('') }
                }}
                onBlur={async () => {
                  if (newGroupName.trim()) await handleCreateGroupInline()
                  else setCreatingGroup(false)
                }}
                placeholder="Folder name…"
                className="w-full rounded-lg border border-indigo-500 bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
              />
            </div>
          )}

          {/* ── Filters: non-MECE map views. Tap to filter the map; they don't
               remove a community from the full list below. ── */}
          {/* All Communities — clears every filter */}
          <button
            onClick={() => { setGroupPicker(null); onSelectCommunity(null) }}
            className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
              allActive ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm">🌍</span>
            <span className="flex-1 text-sm font-medium">All Communities</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${allActive ? 'bg-indigo-700 text-indigo-100' : 'bg-gray-100 text-gray-500'}`}>{allPinCount}</span>
          </button>

          {/* My Subscriptions — filter to subscribed communities' pins */}
          {user && subscribedIds.size > 0 && (
            <button
              onClick={() => { setGroupPicker(null); onShowSubscribed() }}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                showSubscribedOnly ? 'bg-amber-500/20 text-amber-900' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-sm">⭐</span>
              <span className="flex-1 text-sm font-medium">My Subscriptions</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${showSubscribedOnly ? 'bg-amber-500/25 text-amber-900' : 'bg-gray-100 text-gray-500'}`}>{subscribedPinCount}</span>
            </button>
          )}

          {/* Saved — filter to bookmarked pins */}
          {user && savedCount > 0 && (
            <button
              onClick={() => { setGroupPicker(null); onShowSaved() }}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                showSavedOnly
                  ? 'bg-indigo-500/20 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-700">
                <BookmarkCheck className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm font-medium">Saved</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${
                showSavedOnly ? 'bg-indigo-500/20 text-indigo-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {savedCount}
              </span>
            </button>
          )}

          {/* Divider between the filter rows and the folders / full list */}
          <div className="my-2 border-t border-gray-200" />

          {/* ── Group folders ── */}
          {user && groups.map((group) => {
            const collapsed  = !expandedGroups.has(group.id)
            const comms      = groupedMap.get(group.id) ?? []
            const isRenaming = renamingGroupId === group.id

            return (
              <div key={group.id} className="mb-1">
                {/* Group header — chevron expands, name filters the map */}
                <div
                  className={`group/grp mb-0.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${
                    activeFolderId === group.id ? 'bg-indigo-600/20' : 'hover:bg-gray-100/50'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => toggleCollapse(group.id)}
                    title={collapsed ? 'Expand' : 'Collapse'}
                    className="shrink-0 text-gray-400 transition-colors hover:text-gray-700"
                  >
                    {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {isRenaming ? (
                    <input
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(group.id)
                        if (e.key === 'Escape') setRenamingGroupId(null)
                      }}
                      onBlur={() => commitRename(group.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="min-w-0 flex-1 bg-transparent text-xs font-semibold uppercase tracking-wider text-gray-600 outline-none"
                    />
                  ) : (
                    <button onClick={() => onSelectFolder(group.id)} className="min-w-0 flex-1 text-left">
                      <span className={`block truncate text-xs font-semibold uppercase tracking-wider ${
                        activeFolderId === group.id ? 'text-indigo-700' : 'text-gray-500'
                      }`}>
                        {group.name}
                      </span>
                    </button>
                  )}

                  <span className="shrink-0 text-[10px] text-gray-700">{comms.length}</span>

                  {/* Rename / delete — always visible on touch, hover-revealed on desktop */}
                  <div className="flex items-center gap-0.5 transition-opacity md:opacity-0 md:group-hover/grp:opacity-100">
                    {!isRenaming && (
                      <button
                        onClick={(e) => { e.stopPropagation(); startRename(group) }}
                        title="Rename folder"
                        className="rounded p-0.5 text-gray-400 transition-colors hover:text-gray-700"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteGroup(group.id) }}
                      title="Delete folder"
                      className="rounded p-0.5 text-gray-400 transition-colors hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Communities inside this group */}
                {!collapsed && comms.map((c) => renderRow(c, true))}

                {/* Empty folder hint */}
                {!collapsed && comms.length === 0 && (
                  <p className="py-1 pl-8 text-[10px] italic text-gray-700">
                    No communities yet
                  </p>
                )}
              </div>
            )
          })}

          {/* ── Full community list ── every community, alphabetical. Subscribing
               keeps a community here (its star just fills in); folders above are
               non-MECE overlays, so a foldered community still appears here too. ── */}
          {groups.length > 0 && (
            <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              All communities
            </p>
          )}
          {sortedCommunities.map((c) => renderRow(c, false))}

          <div className="my-2 border-t border-gray-200" />

          {/* ── Routes ── */}
          {user && (
            <div className="mb-1" onClick={(e) => e.stopPropagation()}>
              {/* Section header — compact icon buttons, matching Communities */}
              <div className="mb-1 flex items-center justify-between px-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Routes</p>
                <div className="flex items-center gap-1">
                  {routes.length > 0 && (
                    <button
                      onClick={() => { setCreatingFolder((v) => !v); setNewFolderName('') }}
                      title="New route folder"
                      className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => { setCreatingRoute((v) => !v); setNewRouteName('') }}
                    title="New route"
                    className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Inline create inputs */}
              {creatingRoute && (
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  value={newRouteName}
                  onChange={(e) => setNewRouteName(e.target.value)}
                  onBlur={submitNewRoute}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNewRoute()
                    if (e.key === 'Escape') { setCreatingRoute(false); setNewRouteName('') }
                  }}
                  placeholder="Route name…"
                  className="mb-1 w-full rounded-lg border border-indigo-500 bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                />
              )}
              {creatingFolder && (
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onBlur={submitNewFolder}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNewFolder()
                    if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
                  }}
                  placeholder="Folder name…"
                  className="mb-1 w-full rounded-lg border border-indigo-500 bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                />
              )}

              {/* All Routes — auto-folder (expands to every route; no map filter) */}
              {routes.length > 0 && renderAutoFolder(
                allRoutesOpen, () => setAllRoutesOpen((v) => !v),
                false, () => setAllRoutesOpen((v) => !v),
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100"><RouteIcon className="h-3.5 w-3.5 text-gray-600" /></span>,
                'All Routes', routes.length,
                '', '',
                [...routes].sort((a, b) => a.name.localeCompare(b.name)).map(renderRouteRow),
              )}

              {/* Folders (collapsed by default) */}
              {routeFolders.map((folder) => {
                const collapsed = !expandedFolders.has(folder.id)
                const inFolder = routes.filter((r) => r.folder_id === folder.id)
                const isRenaming = renamingFolderId === folder.id
                return (
                  <div key={folder.id} className="mb-1">
                    <div className="group/fld mb-0.5 flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-gray-100/50">
                      <button onClick={() => toggleFolder(folder.id)} className="flex min-w-0 flex-1 items-center gap-1.5">
                        {collapsed ? <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" /> : <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />}
                        {isRenaming ? (
                          <input
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                            value={folderRename}
                            onChange={(e) => setFolderRename(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { if (folderRename.trim()) onRenameRouteFolder(folder.id, folderRename.trim()); setRenamingFolderId(null) }
                              if (e.key === 'Escape') setRenamingFolderId(null)
                            }}
                            onBlur={() => { if (folderRename.trim() && folderRename.trim() !== folder.name) onRenameRouteFolder(folder.id, folderRename.trim()); setRenamingFolderId(null) }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-transparent text-xs font-semibold uppercase tracking-wider text-gray-600 outline-none"
                          />
                        ) : (
                          <span className="truncate text-xs font-semibold uppercase tracking-wider text-gray-500">{folder.name}</span>
                        )}
                      </button>
                      <span className="shrink-0 text-[10px] text-gray-700">{inFolder.length}</span>
                      <div className="flex items-center gap-0.5 transition-opacity md:opacity-0 md:group-hover/fld:opacity-100">
                        {!isRenaming && (
                          <button onClick={(e) => { e.stopPropagation(); setRenamingFolderId(folder.id); setFolderRename(folder.name) }} title="Rename folder"
                            className="rounded p-0.5 text-gray-400 transition-colors hover:text-gray-700">
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); onDeleteRouteFolder(folder.id) }} title="Delete folder (keeps the routes)"
                          className="rounded p-0.5 text-gray-400 transition-colors hover:text-red-500">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {!collapsed && inFolder.map(renderRouteRow)}
                    {!collapsed && inFolder.length === 0 && (
                      <p className="py-1 pl-8 text-[10px] italic text-gray-700">Empty — move routes here</p>
                    )}
                  </div>
                )
              })}

              {/* Ungrouped routes */}
              {routeFolders.length > 0 && routes.some((r) => !r.folder_id) && (
                <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-700">Other routes</p>
              )}
              {routes.filter((r) => !r.folder_id).map(renderRouteRow)}

              {/* Empty state */}
              {routes.length === 0 && routeFolders.length === 0 && !creatingRoute && (
                <p className="px-2 py-1 text-xs text-gray-400">No routes yet — tap + to start one.</p>
              )}
            </div>
          )}
        </div>
        )}

        {/* ── Footer ── */}
        <div className="space-y-3 border-t border-gray-200 p-4">

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div className="space-y-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
                <Lock className="h-3 w-3" />
                {pendingInvites.length === 1
                  ? '1 private map invite'
                  : `${pendingInvites.length} private map invites`}
              </p>
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs"
                    style={{
                      backgroundColor: (invite.community?.color ?? '#6366f1') + '22',
                      border: `2px solid ${invite.community?.color ?? '#6366f1'}`,
                    }}
                  >
                    {invite.community?.icon ?? '🗺️'}
                  </span>
                  <span className="flex-1 truncate text-xs font-medium text-gray-700">
                    {invite.community?.name ?? 'Private Map'}
                  </span>
                  <button
                    onClick={() => onDeclineInvite(invite.id)}
                    title="Decline"
                    className="rounded p-1 text-gray-400 transition-colors hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onAcceptInvite(invite.id)}
                    title="Accept"
                    className="rounded p-1 text-gray-400 transition-colors hover:text-green-600"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Discover link */}
          <Link
            href="/discover"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <Compass className="h-3.5 w-3.5 shrink-0" />
            Discover communities
            <ArrowUpRight className="ml-auto h-3 w-3 opacity-50" />
          </Link>

          {/* Reopen the first-visit welcome */}
          {onShowWelcome && (
            <button
              onClick={onShowWelcome}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <HelpCircle className="h-3.5 w-3.5 shrink-0" />
              How MapCrowd works
            </button>
          )}

          {/* Live indicator */}
          <div className="flex items-center gap-2 px-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <span className="text-xs text-gray-500">Updates are live</span>
          </div>

          {/* User section */}
          {!authReady ? null : user ? (
            <div className="flex items-center gap-2.5">
              <Avatar
                src={user.user_metadata?.avatar_url}
                username={displayName(user)}
                userId={user.id}
                className="h-8 w-8 rounded-full text-xs ring-2 ring-gray-200"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{displayName(user)}</p>
                <p className="truncate text-xs text-gray-500">{user.email}</p>
              </div>
              <button
                onClick={onSignOut}
                title="Sign out"
                className="shrink-0 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onSignIn}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-indigo-500 hover:bg-indigo-600/10 hover:text-gray-900"
            >
              <User2 className="h-4 w-4" />
              Sign in
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
