'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import type { PinPhoto } from '@/lib/types'

interface PinPhotoGalleryProps {
  photos: PinPhoto[]
  /** Alt text fallback when a photo has no caption (usually the pin title). */
  fallbackAlt: string
}

/**
 * Read-only photo carousel at the top of the pin detail modal (§3 split). Purely
 * presentational — the parent fetches `photos` in its batched read and passes them
 * in; this owns only the current-index + broken-image UI state, resetting when the
 * pin's photo set changes.
 */
export default function PinPhotoGallery({ photos, fallbackAlt }: PinPhotoGalleryProps) {
  const [photoIndex, setPhotoIndex] = useState(0)
  const [photoError, setPhotoError] = useState(false)

  // Reset to the first photo (and clear any error) when the pin's photos change.
  useEffect(() => {
    setPhotoIndex(0)
    setPhotoError(false)
  }, [photos])

  if (photos.length === 0) return null
  const currentPhoto = photos[photoIndex]

  return (
    <div className="relative shrink-0 bg-black" style={{ height: 220 }}>
      {!photoError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={currentPhoto?.url}
          src={currentPhoto?.url}
          alt={currentPhoto?.caption ?? fallbackAlt}
          className="h-full w-full object-cover"
          onError={() => setPhotoError(true)}
        />
      ) : (
        <div className="flex h-full items-center justify-center gap-2 text-gray-400">
          <ImageOff className="h-6 w-6" />
          <span className="text-sm">Photo unavailable</span>
        </div>
      )}

      {photos.length > 1 && (
        <>
          <button
            onClick={() => { setPhotoIndex((i) => Math.max(0, i - 1)); setPhotoError(false) }}
            disabled={photoIndex === 0}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-gray-900 backdrop-blur-sm transition-colors hover:bg-black/30 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setPhotoIndex((i) => Math.min(photos.length - 1, i + 1)); setPhotoError(false) }}
            disabled={photoIndex === photos.length - 1}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-gray-900 backdrop-blur-sm transition-colors hover:bg-black/30 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => { setPhotoIndex(i); setPhotoError(false) }}
                className={`h-1.5 rounded-full transition-all ${
                  i === photoIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/40'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
