'use client'

import { useState } from 'react'
import {
  MapPin, Lock, Shield, Eye, EyeOff, Folder, Bookmark, BookmarkCheck, Settings,
  ArrowUpRight, FolderPlus, Check, Upload, Plus, ChevronRight, ChevronDown,
  Pencil, Trash2,
} from 'lucide-react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { Community, CommunityGroup, Pin, PendingInvite } from '@/lib/types'

interface CommunityListProps {
  communities: Community[]
  pins: Pin[]
  selectedCommunity: string | null
  showSubscribedOnly: boolean
  showSavedOnly: boolean
  savedCount: number
  hiddenCommunityIds: Set<string>
  activeFolderId: string | null
  subscribedIds: Set<string>
  ownedCommunityIds: Set<string>
  modCommunityIds: Set<string>
  pendingInvites: PendingInvite[]
  groups: CommunityGroup[]
  communityGroupMap: Map<string, string | null>
  user: User | null
  isAdmin: boolean
  onSelectCommunity: (id: string | null) => void
  onShowSubscribed: () => void
  onShowSaved: () => void
  onToggleSubscription: (id: string) => void
  onOpenSettings: (id: string) => void
  onAddPin: (communityId: string) => void
  onToggleCommunityVisibility: (id: string) => void
  onSelectFolder: (id: string) => void
  onCreateGroup: (name: string) => Promise<string | null>
  onRenameGroup: (id: string, name: string) => void
  onDeleteGroup: (id: string) => void
  onAssignGroup: (communityId: string, groupId: string | null) => void
  onCreateCommunity: () => void
  onImportPlaces: () => void
}

/**
 * The sidebar "Communities" tab body (§3 split): the section header (new folder /
 * import / create), the filter rows (All / My Subscriptions / Saved), the custom
 * community folders, and the full alphabetical community list with per-row actions
 * (subscribe, hide, settings, move-to-folder). All of the folder/group-picker/
 * inline-rename UI state lives here — it was the tangled part keeping this inside
 * the ~1200-line Sidebar. The parent renders it inside the tab's scroll container,
 * above the divider + RoutesSection.
 */
export default function CommunityList({
  communities,
  pins,
  selectedCommunity,
  showSubscribedOnly,
  showSavedOnly,
  savedCount,
  hiddenCommunityIds,
  activeFolderId,
  subscribedIds,
  ownedCommunityIds,
  modCommunityIds,
  pendingInvites,
  groups,
  communityGroupMap,
  user,
  isAdmin,
  onSelectCommunity,
  onShowSubscribed,
  onShowSaved,
  onToggleSubscription,
  onOpenSettings,
  onAddPin,
  onToggleCommunityVisibility,
  onSelectFolder,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onAssignGroup,
  onCreateCommunity,
  onImportPlaces,
}: CommunityListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [groupPicker, setGroupPicker]         = useState<string | null>(null) // communityId
  const [pickerCreating, setPickerCreating]   = useState(false)
  const [pickerNewName, setPickerNewName]     = useState('')
  const [creatingGroup, setCreatingGroup]     = useState(false)
  const [newGroupName, setNewGroupName]       = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue]         = useState('')

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

  return (
    <div onClick={() => setGroupPicker(null)}>
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
              onClick={onImportPlaces}
              title="Import your Google Maps saved places"
              className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
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
              className={`group/grp mb-0.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5 max-md:py-2 ${
                activeFolderId === group.id ? 'bg-indigo-600/20' : 'hover:bg-gray-100/50'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => toggleCollapse(group.id)}
                title={collapsed ? 'Expand' : 'Collapse'}
                className="shrink-0 max-md:p-2 text-gray-400 transition-colors hover:text-gray-700"
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
                    className="rounded p-0.5 max-md:p-2 text-gray-400 transition-colors hover:text-gray-700"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteGroup(group.id) }}
                  title="Delete folder"
                  className="rounded p-0.5 max-md:p-2 text-gray-400 transition-colors hover:text-red-500"
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
    </div>
  )
}
