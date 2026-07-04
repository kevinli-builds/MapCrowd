'use client'

import Link from 'next/link'
import { Compass, MapPin, PlusCircle, X } from 'lucide-react'

// First-visit welcome (localStorage 'mapcrowd.welcomeSeen'). One modal, three
// compact panels — not a wizard. Never shown over a ?pin=/?route= deep link;
// reopenable from the sidebar footer ("How MapCrowd works").
export default function WelcomeModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Welcome to MapCrowd"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-y-auto rounded-t-2xl border border-gray-800 bg-gray-900 p-5 sm:rounded-2xl"
        style={{ maxHeight: '90vh' }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-700 sm:hidden" />

        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-white">🗺️ Welcome to MapCrowd</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-gray-400">
          Shared maps, built by communities. Birds, street art, food carts — every pin is
          someone&rsquo;s local knowledge.
        </p>

        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600/15 text-indigo-400">
              <MapPin className="h-4 w-4" />
            </span>
            <p className="text-sm text-gray-300">
              <span className="font-semibold text-white">Tap any pin</span> for its story — photos,
              comments, votes, and who dropped it.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600/15 text-indigo-400">
              <Compass className="h-4 w-4" />
            </span>
            <p className="text-sm text-gray-300">
              <span className="font-semibold text-white">Find your people</span> — Discover lists
              every public community, and <kbd className="rounded border border-gray-700 bg-gray-800 px-1 text-xs">⌘K</kbd> searches
              everything.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600/15 text-indigo-400">
              <PlusCircle className="h-4 w-4" />
            </span>
            <p className="text-sm text-gray-300">
              <span className="font-semibold text-white">Add what you know</span> — join a
              community, then the ＋ button drops a pin right where you&rsquo;re standing.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Link
            href="/discover"
            onClick={onClose}
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            <Compass className="h-4 w-4" /> Browse communities
          </Link>
          <button
            onClick={onClose}
            className="rounded-lg py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            Just show me the map
          </button>
        </div>
      </div>
    </div>
  )
}
