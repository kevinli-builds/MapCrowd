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
  MapInner.tsx              # Actual Leaflet map + marker logic
  PinClusterLayer.tsx       # Marker clustering layer
  PinDetailModal.tsx        # Pin detail drawer: voting, comments, photos
  AddPinModal.tsx           # Drop-a-pin form
  AuthModal.tsx             # Sign in / sign up modal
  CreateCommunityModal.tsx  # New community form
  CommunitySettingsModal.tsx # Owner/mod settings: queue, rules, mods
  SearchModal.tsx           # Cmd/Ctrl+K command palette search
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

### Mobile sidebar
- Sidebar is a fixed drawer on mobile, permanently visible on `md:` breakpoint
- State: `showMobileSidebar` in `app/page.tsx`
- Hamburger button: fixed top-left, `md:hidden`
- Backdrop: `bg-black/60` div that closes drawer on tap

### Avatar component
- `className` prop carries size, shape, AND text size (e.g. `"h-8 w-8 rounded-full text-xs"`)
- Falls back to colored initials if no `src`
- Color is deterministic: `avatarColor(userId)` from `lib/utils.ts`

### Search
- `SearchModal` (Cmd/Ctrl+K): communities filtered client-side, pins searched via Supabase ILIKE with 200ms debounce
- Keyboard nav: ↑↓ arrows, Enter to select, Escape to close

## Deployment
- **GitHub**: https://github.com/snowwarrior1-alt/Mapper
- **Hosting**: Vercel (connected to GitHub repo)
- **Database**: Supabase project `tmycdgnofvmbyrmpqohw` (AWS us-west-2)

### Vercel env vars required
```
NEXT_PUBLIC_SUPABASE_URL=https://tmycdgnofvmbyrmpqohw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase dashboard>
```

### Auth
- Google OAuth enabled via Supabase Auth
- Callback URL: `https://tmycdgnofvmbyrmpqohw.supabase.co/auth/v1/callback`
- After deploy: set **Site URL** and **Redirect URLs** in Supabase → Authentication → URL Configuration to your Vercel URL

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
- Mobile-responsive sidebar drawer
- Real-time updates (Supabase Realtime channels)
- Custom 404 page
- SEO metadata (OpenGraph + Twitter cards) on community and profile pages
