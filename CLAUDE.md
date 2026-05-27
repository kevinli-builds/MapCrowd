@AGENTS.md

# MapCrowd — Project Context

## What this is
A crowd-sourced mapping platform where users drop geo-tagged pins into thematic communities (like "Birds", "Street Art", "Free WiFi"). Think Reddit meets Google Maps. Built with Next.js 16 + Supabase.

## Tech stack
- **Framework**: Next.js 16.2.6 (App Router, Turbopack)
- **Database + Auth**: Supabase (PostgreSQL, RLS, Realtime, Storage)
- **Map**: Leaflet via `react-leaflet`, with `leaflet.markercluster` for pin clustering
- **Styling**: Tailwind CSS v4
- **Icons**: lucide-react
- **Language**: TypeScript

## Running locally
```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build check
```

`.env.local` needs two variables — get them from Supabase dashboard → Settings → API Keys → Legacy:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co   # must include https://
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**Critical**: The URL must include `https://` — the Supabase SDK v2 rejects bare hostnames with "Must be a valid HTTP or HTTPS URL".

## Project structure
```
app/
  page.tsx                  # Main map page ('use client') — all state lives here
  layout.tsx                # Root layout with fonts
  not-found.tsx             # Branded 404
  c/[slug]/
    layout.tsx              # SEO metadata (server component)
    page.tsx                # Community page ('use client')
  u/[username]/
    layout.tsx              # SEO metadata (server component)
    page.tsx                # Public profile page ('use client')

components/
  Sidebar.tsx               # Left sidebar: community list, search, user auth
  MapWrapper.tsx            # SSR-safe Leaflet wrapper (dynamic import, no SSR)
  MapInner.tsx              # Actual Leaflet map + marker logic + FlyToController
  PinClusterLayer.tsx       # Marker clustering layer
  PinDetailModal.tsx        # Pin detail drawer: voting, comments, photos
  AddPinModal.tsx           # Drop-a-pin form
  AuthModal.tsx             # Sign in / sign up modal
  CreateCommunityModal.tsx  # New community form with duplicate/similar name detection
  CommunitySettingsModal.tsx # Owner/mod settings: queue, rules, mods
  SearchModal.tsx           # Cmd/Ctrl+K command palette search (communities + pins)
  LocationSearch.tsx        # Top-right map geocoding search (Nominatim, no API key)
  Avatar.tsx                # Shared avatar component (image or initials fallback)

lib/
  supabase.ts               # Supabase client (validates env vars at startup)
  types.ts                  # Shared TypeScript types (Community, Pin, etc.)
  utils.ts                  # Shared helpers: timeAgo, avatarColor, formatCount
  session.ts                # Anonymous session ID for voting (localStorage)

supabase/
  00-base-schema-migration.sql           # Run FIRST — tables, RLS, seed data
  01-moderation-migration.sql
  02-community-settings-migration.sql
  03-comments-migration.sql
  04-photos-and-community-page-migration.sql
  05-search-profiles-migration.sql
  # Files below are SUPERSEDED — do not run:
  schema.sql
  auth-migration.sql
  community-creation-migration.sql
```

## Database schema (high level)
| Table | Purpose |
|---|---|
| `profiles` | Public user profiles, auto-created on signup via trigger |
| `communities` | Map communities with color, icon, slug, settings |
| `pins` | Geo-tagged posts with title, lat/lng, vote_count, status, expires_at |
| `votes` | Anonymous votes by session_id (+1/-1), managed by `vote_on_pin()` RPC |
| `comments` | Comments on pins |
| `pin_photos` | Photo uploads linked to pins (stored in `pin-photos` Storage bucket) |
| `community_moderators` | Mod assignments per community |
| `community_subscriptions` | User subscriptions to communities |

Key RPCs:
- `vote_on_pin(p_pin_id, p_session_id, p_value)` — SECURITY DEFINER, handles toggle/switch/new votes
- `get_community_stats(p_community_id)` — pin count + subscriber count
- `get_profile_stats(p_user_id)` — pin count, total votes, community count

## Architecture decisions & gotchas

### Next.js 16 specifics
- `params` in `generateMetadata` is `Promise<{...}>` — must be `await`ed
- `generateMetadata` can only be exported from Server Components — client pages use a sibling `layout.tsx` for SEO
- Client components (with `'use client'`) are still SSR'd during build; module-level Supabase client creation runs at prerender time, so env vars must be valid

### Supabase RLS
- `vote_on_pin()` is SECURITY DEFINER — it does NOT need an UPDATE policy on `pins`
- There is intentionally NO `pins_update_vote_count` policy (removed as a security hole — it allowed any user to UPDATE any pin directly)
- The `pins_insert_auth` policy name is referenced by `02-community-settings-migration.sql` (drops it by name), so the name must match exactly
- `community_subscriptions` SELECT is RLS-restricted to own rows — `get_community_stats()` is SECURITY DEFINER to count subscribers publicly

### Supabase client in layouts
- `app/c/[slug]/layout.tsx` and `app/u/[username]/layout.tsx` create the Supabase client **inside** `generateMetadata()`, not at module level — this prevents build crashes when env vars aren't set yet

### Mobile sidebar & z-index
- Sidebar is a fixed drawer on mobile, permanently visible on `md:` breakpoint
- State: `showMobileSidebar` in `app/page.tsx`
- Hamburger button: `fixed left-4 top-4 z-[1001]` — must be above 1000 to clear Leaflet's internal z-indices
- Sidebar drawer: `z-[1002]`, backdrop: `z-[1001]` — same reason
- **Critical**: Leaflet internally uses z-indices up to ~1000 for tiles, markers, popups, controls. Any UI element that must appear above the map must use `z-[1001]` or higher. Tailwind's `z-50` (50) is NOT enough.

### LocationSearch (geocoding)
- Uses **Nominatim** (OpenStreetMap) — free, no API key, rate limit ~1 req/s
- 500 ms debounce in the browser satisfies the rate limit per-user
- `bboxZoom()` derives zoom from the result's bounding box so cities/neighbourhoods/countries all land at an appropriate zoom level
- `FlyToTarget` has a monotonically-increasing `id` field — the `FlyToController` inside `MapContainer` watches `target` by reference, so passing a new object (even with same coords) always triggers a new `flyTo`
- `LocationSearch` is rendered as `absolute right-4 top-4 z-[1001]` inside `<main className="relative flex-1">` so it stays top-right of the map on both desktop (next to sidebar) and mobile (full width)
- `onMouseDown` with `e.preventDefault()` is used in the dropdown buttons to prevent the input from losing focus before the click registers

### Avatar component
- `className` prop carries size, shape, AND text size (e.g. `"h-8 w-8 rounded-full text-xs"`)
- Falls back to colored initials if no `src`
- Color is deterministic: `avatarColor(userId)` from `lib/utils.ts`

### Search
- `SearchModal` (Cmd/Ctrl+K): communities filtered client-side, pins searched via Supabase ILIKE with 200ms debounce
- Keyboard nav: ↑↓ arrows, Enter to select, Escape to close

### Community creation
- Any logged-in user can create a community via the `+` button in the sidebar community list header
- `CreateCommunityModal` runs a debounced (350 ms) Supabase ILIKE search on the name field
- Exact name match (case-insensitive) → red error, Create button disabled
- Similar names → yellow warning, creation still allowed (to support e.g. "Free Bathrooms Portland" vs "Free Bathrooms New York")
- `toSlug()` appends a 4-char random suffix so slugs stay unique even with identical names

## Deployment
- **GitHub**: https://github.com/snowwarrior1-alt/Mapper
- **Hosting**: Vercel (connected to GitHub repo, auto-deploys on push to `main`)
- **Live URL**: https://mapper-gamma.vercel.app/
- **Database**: Supabase project `tmycdgnofvmbyrmpqohw` (AWS us-west-2)

### Vercel env vars required
```
NEXT_PUBLIC_SUPABASE_URL=https://tmycdgnofvmbyrmpqohw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase dashboard>
```

### Auth
- Google OAuth enabled via Supabase Auth
- Callback URL: `https://tmycdgnofvmbyrmpqohw.supabase.co/auth/v1/callback`
- Supabase → Authentication → URL Configuration: Site URL and Redirect URLs set to `https://mapper-gamma.vercel.app/**`

### Running SQL migrations
Run in order in Supabase SQL Editor (00 → 05). All use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` so they're safe to re-run.

## Features built
- Interactive Leaflet map with pin clustering
- Community sidebar with subscribe, filter, settings
- Drop pins with title, description, community, optional expiry
- Upvote/downvote pins (anonymous, session-scoped)
- Comments on pins
- Photo uploads to pins (Supabase Storage)
- Community moderation queue (approve/reject pending pins)
- Community settings: who_can_pin, require_approval, default_pin_duration
- Moderator management (owners can assign mods)
- Community rules
- Cmd/Ctrl+K search modal (communities + pins)
- Public community pages at `/c/[slug]`
- Public user profile pages at `/u/[username]`
- Google OAuth sign-in
- Mobile-responsive sidebar drawer (hamburger top-left on mobile)
- Real-time updates (Supabase Realtime channels)
- Custom 404 page
- SEO metadata (OpenGraph + Twitter cards) on community and profile pages
- Any logged-in user can create communities (with duplicate/similar name detection)
- **Geocoding / map search**: top-right search bar flies the map to any place in the world (Nominatim)

## 🔜 Next session — PRIVATE MAPS

**Reminder for next time**: the user wants to implement **private communities/maps**.

### Use-case
"I want to create a group map of where all my friends live — but I definitely do not want that to be public."

### What needs to be built

1. **Private community flag**
   - Add `is_private: boolean` (default `false`) to the `communities` table
   - Private communities are invisible to non-members in the sidebar, search, and community listing
   - RLS: non-members cannot SELECT pins or community details for private communities

2. **Membership / invite system** ("friending" / "add to community")
   - New table: `community_members` (or reuse/extend `community_subscriptions` with a `role` column)
   - The owner invites users by username or email
   - Invited users see a notification or accept/decline flow
   - Only accepted members can view and pin to a private community

3. **Friend graph** (optional but likely needed)
   - New table: `friendships` with `(requester_id, addressee_id, status: pending|accepted|blocked)`
   - Friends can be invited to private maps more easily
   - Could surface a "Friends" tab in the sidebar showing friends' recent pins

### Key design questions to settle at the start of next session
- Should private communities still use the existing `communities` table (with `is_private` flag) or a separate `private_maps` table?
- Is the invite model email-based, username-based, or link-based (shareable invite URL)?
- Should the friend system be a full social graph, or just a lightweight "community member invite" (no global friend list)?
- What do non-members see when they navigate to a private community's `/c/[slug]` URL — 404, or a "request access" page?
