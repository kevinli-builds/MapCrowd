# MapCrowd — Handoff & Status

A living summary of where the project stands and what's outstanding. For deep
architecture, conventions, and the full feature list, see [`CLAUDE.md`](./CLAUDE.md).

- **Live:** https://mapcrowd.vercel.app  (legacy alias `mapper-gamma.vercel.app` still resolves)
- **Repo:** https://github.com/snowwarrior1-alt/Mapper  (public)
- **Stack:** Next.js 16 (App Router, Turbopack) · Supabase (Postgres + RLS + Auth + Storage + Realtime) · Leaflet · Tailwind v4 · TypeScript · Vercel
- **DB:** Supabase project `tmycdgnofvmbyrmpqohw`

## What MapCrowd is
A crowd-sourced mapping platform: users drop geo-tagged pins into thematic
communities ("Birds", "Street Art", "Fun Bars"), vote/comment, and build
routes/trails. Think Reddit meets Google Maps.

## Feature set (high level — see CLAUDE.md for the full list)
- Interactive Leaflet map with pin clustering; light/dark/satellite styles.
- Communities: subscribe, moderate, tags, geo-restriction, private/invite-only,
  per-community color/icon (owner-editable), public pages at `/c/[slug]`.
- Pins: anonymous or signed-in, votes, comments, photos, events/RSVP, external
  links, an editable address, shareable `/?pin=` links.
- **Routes / trails suite:**
  - Full-screen builder; add stops from a community's existing pins or by tapping
    the map; reorder; per-route color + travel mode.
  - **Visibility:** Private / Public link / Publish-to-community (only when all
    stops are in one community). Community routes show on the community page and
    in the in-app community panel; open read-only via `/?route=<id>`.
  - **Real routing:** street/trail-following geometry via OpenRouteService
    (server-proxied at `/api/route`, auth-gated), cached on the route.
  - **Optional/branching stops:** a step can hold alternatives ("…then 3 or 4 or 5").
  - **Folders:** organize routes into collapsible folders.
- **Smart-folder sidebar:** All Communities / My Subscriptions / custom folders /
  auto-"Other" — every folder filters the map on click and expands (chevron) to
  its members; non-MECE (Gmail-label style); collapsed by default. (The old
  "Collections" feature was retired; its tables remain in the DB, reversible.)
- Mobile-streamlined: bottom nav, bottom-sheet modals, drawer that closes on any
  selection, density-tuned root font.
- Search (Cmd/Ctrl+K), Discover page, user profiles + follows, unified activity feed.

## Operational status / open items
**Supabase migrations** (`supabase/NN-*.sql`, idempotent — run unrun ones in the
SQL editor): 00–32 applied to the live DB. **Run 33** (route_folders) and **34**
(public-link routes) if not yet. **35** (routes.user_id → profiles FK) is
*optional* — only needed to re-enable a "by {author}" label on routes.

**Env vars** (Vercel + local `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — required.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; used by `/api/invite`.
- `ORS_API_KEY` — server-only; powers `/api/route` snapped routing. **Must be set
  in Vercel (Production)** or deployed routes fall back to straight lines
  (proxy returns 503; client logs `[route] proxy 503`).

**Worth a signed-in spot-check** (owner-only; not exercisable logged-out): route
builder ⋯ menu, publish→community, community settings (icon/color/folder
assignment), Quick-add FAB + map-style popover.

**Deferred (intentional):**
- Lint debt (mostly `react-hooks/set-state-in-effect`) — clean up before gating
  `npm run lint` in CI. `next build` does not enforce it.
- Viewport-based pin loading for large scale — today all approved pins load into
  memory (fine at current scale; powers sidebar counts + feed + filters).

## Dev
```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm test         # vitest unit tests for lib/ pure logic
```
Verify changes by running the app (preview), not just building. CI runs
`npm test` + `npm run build` on push/PR.
