/**
 * Pure presentation logic for in-app notifications — kept out of the component so
 * the wording + navigation target of each notification type can be unit-tested
 * (see notifications.test.ts). The rows themselves are written server-side by
 * triggers (migration 39) and can't be forged by a client.
 */
import type { AppNotification, NotificationType } from './types'

export interface NotificationDescription {
  /** The actor's display name to render in bold, or null (system messages). */
  actorName: string | null
  /** The rest of the sentence after the bolded name (or the whole line if no actor). */
  text: string
  /** What a click should open: the target pin, the actor's profile, or nothing. */
  target: 'pin' | 'profile' | 'none'
}

/** Quote a pin title compactly, truncating very long ones. */
function quoteTitle(title: string | undefined | null): string {
  const t = (title ?? '').trim()
  if (!t) return 'your pin'
  const short = t.length > 40 ? `${t.slice(0, 39)}…` : t
  return `“${short}”`
}

/** Describe a notification: the bolded actor (if any), the sentence, and where a tap goes. */
export function describeNotification(n: Pick<AppNotification, 'type' | 'actor' | 'pin'>): NotificationDescription {
  const actorName = n.actor?.username ?? null
  const pinTitle = quoteTitle(n.pin?.title)

  switch (n.type as NotificationType) {
    case 'comment':
      return { actorName, text: `commented on ${pinTitle}`, target: 'pin' }
    case 'rsvp':
      return { actorName, text: `is going to your event ${pinTitle}`, target: 'pin' }
    case 'follow':
      return { actorName, text: 'started following you', target: 'profile' }
    case 'pin_approved':
      return { actorName: null, text: `Your pin ${pinTitle} was approved`, target: 'pin' }
    case 'pin_rejected':
      return { actorName: null, text: `Your pin ${pinTitle} was declined`, target: 'pin' }
    default:
      return { actorName, text: 'sent you a notification', target: 'none' }
  }
}

/** Emoji glyph shown alongside each notification kind. */
export function notificationIcon(type: NotificationType): string {
  switch (type) {
    case 'comment': return '💬'
    case 'rsvp': return '📅'
    case 'follow': return '⭐'
    case 'pin_approved': return '✅'
    case 'pin_rejected': return '🚫'
    default: return '🔔'
  }
}
