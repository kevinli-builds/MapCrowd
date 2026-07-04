# MapCrowd — Product / Design / Engineering Brief

_Written 2026-07-03 by a Claude review session covering the whole project portfolio.
Audience: a future Opus session executing on this. Read `CLAUDE.md` first — it is
the source of truth for conventions (z-index tiers, RLS patterns, migration rules).
Before implementing anything below, verify the current state of the code — features
may have shipped since this was written._

---

## 1. Product roadmap (PM)

MapCrowd is feature-deep (routes, events, collections, private communities) but has
a **cold-start and retention problem**: a new visitor lands on an empty-ish map with
no reason to return. The next features should optimize the loop
*visit → find something local → contribute → get pulled back*.

### P0 — Abuse reporting (trust & safety gap, ship before promoting the app)
There is no way for a user to report a pin/comment/photo. For a UGC platform with
anonymous pins this is the missing table-stake.
**Instructions for Opus:**
- New migration `37-reports.sql` (follow the numbered-migration convention and keep
  `schema-current.sql` in sync): `reports(id, reporter_id nullable, target_type
  'pin'|'comment'|'photo', target_id, reason text, created_at)`, RLS: insert by
  anyone (incl. anonymous), select only via `is_community_mod()` of the target's
  community or `is_site_admin()`.
- "Report" action in `PinDetailModal.tsx` (pin + each comment) with a small reason
  picker (spam / inappropriate / wrong location / other).
- Surface open reports in `CommunitySettingsModal.tsx`'s moderation queue tab with
  resolve/delete actions.
- Auto-hide threshold is optional v2; don't build it yet.

### P1 — Notifications + notification center (retention)
Realtime channels exist but nothing pulls a user back.
**Instructions for Opus:**
- Migration: `notifications(id, user_id, type, actor_id, pin_id/community_id,
  read_at, created_at)` + RLS own-rows-only. Write rows via Postgres triggers
  (comment on my pin, RSVP to my event, new follower, pin approved/rejected from
  mod queue) so clients can't forge them.
- Bell icon in `Sidebar.tsx` header + `BottomNav` badge; a dropdown/sheet listing
  notifications, mark-read on open. Use the existing Supabase Realtime channel
  pattern for live updates.
- Web push is a separate later step (needs a service worker + a send path — Supabase
  Edge Function or Vercel route with the service key). Do in-app first.

### P1 — First-visit onboarding / local landing (activation)
**Instructions for Opus:**
- On first visit (no localStorage flag), geolocate (or IP-locate via the map's
  initial view) and open a one-time sheet: "Communities near you" (query communities
  with pins within the viewport) + 2–3 featured global ones. Subscribe buttons inline.
- If nothing is nearby, fall back to a "start one for your city" CTA that opens
  `CreateCommunityModal` pre-filled.
- Keep it dismissible and never show again (`onboardingSeen` in localStorage,
  same pattern as `quickAddHelpSeen`).

### P2 — Community invite links (growth loop)
Invites today are username/email only (`community_email_invites`). A copyable join
link is the viral mechanism.
**Instructions for Opus:**
- Migration: `community_invite_links(token uuid pk, community_id, created_by,
  expires_at, max_uses, use_count)`; SECURITY DEFINER RPC `redeem_invite(token)`
  that inserts into `community_members` after checks; RLS: mods manage links.
- UI in `CommunitySettingsModal.tsx` (create/copy/revoke) and a `/join/[token]`
  route that redeems after auth and lands on `/c/[slug]`.

### P2 — PWA installability
Mobile UX is already good (bottom nav, sheets); make it installable.
Manifest + icons + minimal service worker (cache shell, not tiles). Mirror what
Do I Want To Know's web app did for its PWA setup.

### P3 — GPX/GeoJSON export for routes; community data export
Routes are a differentiator; letting hikers export GPX makes them shareable
outside the app. Pure client-side generation from `route_pins` + snapped geometry.

### Explicitly not now
Native apps, algorithmic feeds, DMs — the community/moderation core needs to
harden first.

---

## 2. Design audit

Strengths: coherent mobile system (bottom sheets everywhere, documented z-index
tiers, 44px targets), map style switcher, thoughtful quick-add flow.

Issues, in priority order:
1. **Sidebar overload.** Communities, Feed, Groups, Collections, Routes, Saved all
   stack in one drawer (`Sidebar.tsx`, ~1,000 lines of UI). Group the personal
   library (Saved / Collections / Routes) under one "Library" section or tab;
   keep Communities + Feed primary.
2. **Pin detail modal is doing too much.** Vote, comments, photos, save, lists,
   share, edit, tags, report (soon) in one sheet. Move secondary actions
   (save/lists/share/edit) behind a compact action row with an overflow "⋯" menu.
3. **No empty states.** Empty map view, empty feed, empty community all need a
   friendly prompt with one clear action (subscribe / drop first pin / invite).
4. **Brand identity is default-Tailwind.** Pick one accent + a display font for
   headers; the map itself is the hero, chrome should recede. Small, cheap win:
   consistent marker/cluster styling with the accent.
5. **Legend/affordance gaps.** Followed-user ⭐ and event 📅 badges aren't
   explained anywhere; add a small "map key" popover under the style switcher.

---

## 3. Engineering audit

### Refactor targets
- **`app/page.tsx` (1,173 lines) is the god component** — all map/filter/route/
  modal state. Extract hooks: `usePins`, `useCommunities`, `useRouteBuilder`,
  `useMapFilters`, plus a `MapPageContext` so `Sidebar`/`BottomNav` stop taking
  a dozen props each. Do this before adding notifications (which will add more
  state).
- **`Sidebar.tsx` (1,042) and `PinDetailModal.tsx` (1,019)**: split by section
  (e.g. `sidebar/CommunityList.tsx`, `sidebar/LibrarySection.tsx`,
  `pin/Comments.tsx`, `pin/PhotoStrip.tsx`).
- **Lint debt**: `react-hooks/set-state-in-effect` warnings block adding
  `npm run lint` to CI (noted in CLAUDE.md). Clean these up, then add lint to
  `.github/workflows/ci.yml`.

### Security audit potential
Posture is unusually good (auth-based votes, SECURITY DEFINER with pinned
`search_path`, XSS CHECK constraints, DB-level rate limits). Remaining:
1. **Anonymous-pin abuse**: Postgres triggers can't rate-limit anonymous inserts
   (documented). Add a Vercel Edge Middleware IP limiter on the Supabase insert
   path is not possible (client talks to Supabase directly) — instead route
   anonymous pin creation through a Next API route with an IP limiter, or a
   Supabase Edge Function. Decide and implement one.
2. **Security headers**: Tracker has `headers()` in `next.config.ts` (XFO, CSP
   frame-ancestors, HSTS…). Verify MapCrowd has the same; port them if not.
3. **Storage hardening**: verify the `pin-photos` bucket enforces size/MIME limits
   server-side (bucket-level `file_size_limit` + `allowed_mime_types`), not just
   client-side.
4. **Nominatim/Overpass usage policy**: both require an identifying User-Agent
   and modest rates; verify requests set one, and add graceful degradation when
   rate-limited (geocode search + quick-add both depend on them).
5. **`/api/invite` uses the service-role key** — re-verify it validates the caller
   is a mod of the community before acting (it bypasses RLS by definition).

---

## 4. Surprise & delight (unbuilt ideas — cherry-pick)

_Deliberately playful features. None block the roadmap above; each is a
self-contained "moment" that makes the app feel alive. Ship after the P0/P1s,
or grab one as a morale build._

### D1 — "Surprise me" dice button
A dice icon next to "Near Me" that flies the map to one random *good* pin
(has a photo or ≥N votes) — near the viewport first, then anywhere on Earth with
a long dramatic `flyTo`. Zero schema; client-side pick from loaded pins, reuse
the `FlyToTarget` mechanism. The exploration equivalent of Wikipedia's Random
Article — cheap, and it shows off the whole dataset.

### D2 — Scavenger hunts (route check-ins)
Routes already exist; add the game layer: an "I'm here" button when the user is
within ~75m of a stop (`distanceMeters` in `lib/geo.ts`), a progress ring on the
route viewer, and a finisher badge on the profile. Mods can publish a community
hunt (a public route framed as a challenge). Migration: `route_checkins(user_id,
route_id, pin_id, created_at)` + RLS own-rows. This turns routes from reference
material into a reason to leave the house — the most on-mission delight possible.

### D3 — Time-capsule pins
A pin with a `reveal_at` date renders as a sealed 🔒 marker (title hidden) until
the date passes — "open when the cherry blossoms bloom", event teasers,
community anniversaries. Migration: `pins.reveal_at timestamptz?`; filter
title/description in the pin SELECT via a view or client mask, reveal
automatically. Creates return visits on a *date certain*.

### D4 — Pin postcards
"Send as postcard" in the share menu: canvas-render the pin photo + title +
a mini map crop + community name into a postcard-styled image for download.
Pure client-side; pairs with the existing `/?pin=` share links and gives every
shared pin a visual ad.

### D5 — "One year ago" feed items
The Feed tab occasionally interleaves "A year ago you pinned ⭐ *Best banh mi
cart*" (simple `created_at` window query on the user's own pins). Nostalgia is
the cheapest retention feature ever built.

### D6 — Community year-in-review
"MapCrowd Wrapped" per community: top pins, new members, total km of routes,
most-RSVP'd event — rendered as a story card the owner can post. Reuse the
share-card mechanics from Do I Want To Know's brief (same canvas approach).

---

## 5. First-visit cold open (user-requested 2026-07-04 — build next)

A one-time welcome overlay for brand-new visitors, per the site-wide pattern.

- New `components/WelcomeModal.tsx` at top-modal tier (`z-[1300]`), bottom
  sheet on mobile per the modal conventions (drag handle, `sm:` centered).
- Three compact panels in ONE modal (not a multi-step wizard — map users bail):
  1. **What this is** — "Shared maps, built by communities. Birds, street art,
     food carts — every pin is someone's local knowledge."
  2. **Explore** — tap any pin · ⌘K to search · Discover lists every public
     community. Buttons: "Browse communities" (→ `/discover`) and "Just show
     me the map" (dismiss).
  3. **Contribute** — join a community, then the ＋ button drops a pin where
     you are (Quick Add already explains itself on first use).
- Trigger in `app/page.tsx`: on mount when `localStorage['mapcrowd.welcomeSeen']`
  is unset AND there is no `?pin=` / `?route=` deep link (never cover content
  someone was linked to). Set the flag on any dismissal.
- Reopen: a "?" row at the bottom of the Sidebar (both tabs).
- Signed-in users who already subscribe to ≥1 community should never see it
  (they are not new — check after subscriptions load, or just gate on the
  localStorage flag which covers the practical case).
