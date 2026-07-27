'use client'

import Link from 'next/link'
import { Bell, X } from 'lucide-react'
import type { AppNotification } from '@/lib/types'
import { describeNotification, notificationIcon } from '@/lib/notifications'
import { timeAgo } from '@/lib/utils'

interface NotificationsPanelProps {
  notifications: AppNotification[]
  onClose: () => void
  /** Open the target pin (fetches + flies to it in the page). */
  onOpenPin: (pinId: string) => void
}

export default function NotificationsPanel({ notifications, onClose, onOpenPin }: NotificationsPanelProps) {
  return (
    <div
      className="absolute inset-0 z-[1300] flex items-end bg-black/40 sm:items-start sm:justify-end sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:mt-14 sm:max-w-sm sm:rounded-2xl"
        style={{ maxHeight: '80dvh' }}
      >
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-indigo-600" />
            <h2 className="font-semibold text-gray-900">Notifications</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(80dvh - 3rem)' }}>
          {notifications.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mb-2 text-3xl">🔔</div>
              <p className="text-sm font-medium text-gray-900">No notifications yet</p>
              <p className="mt-1 text-xs text-gray-500">
                When someone comments on your pins, RSVPs to your events, or follows you, it shows up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {notifications.map((n) => {
                const { actorName, text, target } = describeNotification(n)
                const unread = !n.read_at
                const body = (
                  <>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-base">
                      {notificationIcon(n.type)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm text-gray-700">
                        {actorName && <span className="font-semibold text-gray-900">{actorName} </span>}
                        {text}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                    </span>
                    {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-600" />}
                  </>
                )
                const rowClass = `flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                  unread ? 'bg-indigo-50/50' : ''
                }`

                if (target === 'profile' && actorName) {
                  return (
                    <li key={n.id}>
                      <Link href={`/u/${actorName}`} onClick={onClose} className={rowClass}>
                        {body}
                      </Link>
                    </li>
                  )
                }
                if (target === 'pin' && n.pin) {
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => { onOpenPin(n.pin!.id); onClose() }}
                        className={rowClass}
                      >
                        {body}
                      </button>
                    </li>
                  )
                }
                return (
                  <li key={n.id} className={rowClass}>{body}</li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
