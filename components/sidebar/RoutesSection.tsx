'use client'

import { useState } from 'react'
import {
  Plus, FolderPlus, Folder, Trash2, ChevronRight, ChevronDown, Pencil, Check,
  Globe, Route as RouteIcon,
} from 'lucide-react'
import type { Route, RouteFolder } from '@/lib/types'

interface RoutesSectionProps {
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
}

/**
 * The sidebar "Routes" section (§3 split): the user's routes + route folders, with
 * inline create/rename, the collapsible "All Routes" auto-folder, per-route
 * move-to-folder, and delete. Fully self-contained — its state (create/rename
 * inputs, folder expansion, the move-menu) lives here; the parent renders it inside
 * the communities tab gated on a signed-in user.
 */
export default function RoutesSection({
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
}: RoutesSectionProps) {
  // All Routes auto-folder — collapsed by default
  const [allRoutesOpen, setAllRoutesOpen] = useState(false)

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
        <button onClick={() => onSelectRoute(r.id)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left md:py-2">
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
            className="shrink-0 p-1 max-md:p-2 text-gray-500 transition-opacity hover:text-gray-700 md:opacity-0 md:group-hover/route:opacity-100"
          >
            <Folder className="h-3.5 w-3.5" />
          </button>
        )}
        {/* Delete */}
        <button
          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete the route “${r.name}”? This can't be undone.`)) onDeleteRoute(r.id) }}
          title="Delete route"
          className="shrink-0 p-1 pr-2 max-md:p-2 text-gray-500 transition-opacity hover:text-red-500 md:opacity-0 md:group-hover/route:opacity-100"
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

  return (
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
            <div className="group/fld mb-0.5 flex items-center gap-1 rounded-lg px-2 py-1.5 max-md:py-2 hover:bg-gray-100/50">
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
                    className="rounded p-0.5 max-md:p-2 text-gray-400 transition-colors hover:text-gray-700">
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); onDeleteRouteFolder(folder.id) }} title="Delete folder (keeps the routes)"
                  className="rounded p-0.5 max-md:p-2 text-gray-400 transition-colors hover:text-red-500">
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
  )
}
