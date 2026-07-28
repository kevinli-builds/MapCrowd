'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Check, Compass, LogOut, Lock, MapPin, Search, User2, ArrowUpRight, X, Newspaper,
  HelpCircle, Bell,
} from 'lucide-react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { Community, CommunityGroup, Pin, PendingInvite, Route, RouteFolder } from '@/lib/types'
import Avatar from '@/components/Avatar'
import ActivityFeed from '@/components/ActivityFeed'
import RoutesSection from '@/components/sidebar/RoutesSection'
import CommunityList from '@/components/sidebar/CommunityList'

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
  onImportPlaces: () => void
  onOpenNotifications: () => void
  unreadCount: number
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
  onImportPlaces,
  onOpenNotifications,
  unreadCount,
  onOpenSearch,
  mobileOpen,
  onMobileClose,
  isAdmin = false,
  onShowWelcome,
}: SidebarProps) {
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
  // The community-list section (its group-picker/folder/rename state, helpers, and
  // renderRow) lives in components/sidebar/CommunityList; Routes in RoutesSection.

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
            {user && (
              <button
                onClick={onOpenNotifications}
                title="Notifications"
                aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
                className="relative rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold leading-none text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            )}
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
        <div className="flex-1 overflow-y-auto p-3">
          <CommunityList
            communities={communities}
            pins={pins}
            selectedCommunity={selectedCommunity}
            showSubscribedOnly={showSubscribedOnly}
            showSavedOnly={showSavedOnly}
            savedCount={savedCount}
            hiddenCommunityIds={hiddenCommunityIds}
            activeFolderId={activeFolderId}
            subscribedIds={subscribedIds}
            ownedCommunityIds={ownedCommunityIds}
            modCommunityIds={modCommunityIds}
            pendingInvites={pendingInvites}
            groups={groups}
            communityGroupMap={communityGroupMap}
            user={user}
            isAdmin={isAdmin}
            onSelectCommunity={onSelectCommunity}
            onShowSubscribed={onShowSubscribed}
            onShowSaved={onShowSaved}
            onToggleSubscription={onToggleSubscription}
            onOpenSettings={onOpenSettings}
            onAddPin={onAddPin}
            onToggleCommunityVisibility={onToggleCommunityVisibility}
            onSelectFolder={onSelectFolder}
            onCreateGroup={onCreateGroup}
            onRenameGroup={onRenameGroup}
            onDeleteGroup={onDeleteGroup}
            onAssignGroup={onAssignGroup}
            onCreateCommunity={onCreateCommunity}
            onImportPlaces={onImportPlaces}
          />

          <div className="my-2 border-t border-gray-200" />

          {/* ── Routes ── */}
          {user && (
            <RoutesSection
              routes={routes}
              activeRouteId={activeRouteId}
              onSelectRoute={onSelectRoute}
              onCreateRoute={onCreateRoute}
              onDeleteRoute={onDeleteRoute}
              routeFolders={routeFolders}
              onCreateRouteFolder={onCreateRouteFolder}
              onRenameRouteFolder={onRenameRouteFolder}
              onDeleteRouteFolder={onDeleteRouteFolder}
              onAssignRouteFolder={onAssignRouteFolder}
            />
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
                    className="rounded p-1 max-md:p-2 text-gray-400 transition-colors hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onAcceptInvite(invite.id)}
                    title="Accept"
                    className="rounded p-1 max-md:p-2 text-gray-400 transition-colors hover:text-green-600"
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
