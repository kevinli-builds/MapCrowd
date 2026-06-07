'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Route-level error boundary. Next.js renders this instead of a blank screen
 * when a render error escapes the page. `reset()` re-attempts the segment.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface to the console (and any error reporter wired up later)
    console.error('[MapCrowd] render error:', error)
  }, [error])

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15">
        <AlertTriangle className="h-6 w-6 text-red-400" />
      </div>
      <div>
        <h1 className="text-lg font-bold text-white">Something went wrong</h1>
        <p className="mt-1 max-w-sm text-sm text-gray-500">
          The map hit an unexpected error. Trying again usually fixes it — your data is safe.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <RotateCcw className="h-4 w-4" />
          Try again
        </button>
        <a
          href="/"
          className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
        >
          Reload map
        </a>
      </div>
    </div>
  )
}
