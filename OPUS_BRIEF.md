# MapCrowd — Product / Design / Engineering Brief

_Written 2026-07-03 by a Claude review session covering the whole project portfolio.
Audience: a future Opus session executing on this. Read `CLAUDE.md` first — it is
the source of truth for conventions (z-index tiers, RLS patterns, migration rules).
Before implementing anything below, verify the current state of the code — features
may have shipped since this was written._

---

## 0. Status ledger (2026-07-05) + how to pick up

**Shipped ✓** — abuse reporting (P0); first-visit welcome modal (§5); full light theme (see CLAUDE.md theme note).
**Next → (highest value first)** — refactor `page.tsx` per the §7 decomposition blueprint FIRST, then §1 notifications; §6 Google-Maps-saved-places import ⭐ (the acquisition play); §9 C1 mod community-insights ⭐. **§8 mobile SHIPPED (2026-07-13)** — 44px hamburger; route rows py-2.5 on mobile; folder headers/chevrons + all small icon buttons `max-md:p-2` (desktop unchanged); real-device long-press/pinch checks remain the user's. **`CHECKINS_SPEC.md`** is a fully-designed check-ins/outings feature ready to build — it needs the user's four open-decisions (its §8) answered first.
**Usability fix SHIPPED (2026-07-13)** — the folder rename/delete buttons (community groups +
route folders in `Sidebar.tsx`) were un-gated `opacity-0 group-hover` reveals, invisible on
touch; now `md:`-gated (always visible on phones, hover-revealed on desktop). Landed together
with the previously-uncommitted in-flight work it sat on top of: **sidebar IA rework**
(filter rows + full alphabetical list, folders as non-MECE overlays), **desktop-resizable
sidebar** (240–520px drag handle, width persisted), `@theme` brightness tokens + the
yellow→amber sweep (all of which CLAUDE.md already documented as conventions). Verified via
tests + production build + CSS artifact inspection; note the in-app browser pane can't
advance CSS transitions (frozen compositor), so drawer-slide checks were done at the CSS
level, not visually.
**Ops (apply in Supabase SQL editor if unrun)** — migrations 33, 34, and 37-reports.sql.
**Deferred** — lint→CI (existing `react-hooks/set-state-in-effect` debt); viewport-based pin loading (fine at current scale).

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

---

## 6. Wave 2 — after the cold open (written 2026-07-04)

_State at writing: abuse reporting (P0) and the welcome modal (section 5) are
LIVE. Notifications, invite links, and PWA from section 1 remain. Verify
state before building._

### W1 — The retention pair (do together, refactor first)
1. **Refactor precondition**: split `app/page.tsx` (~1,200 lines) into hooks
   (`usePins`, `useCommunities`, `useRouteBuilder`, `useMapFilters`) per
   section 3 — notifications add too much state to bolt onto the monolith.
2. **Notifications + bell** (section 1 P1 spec) — triggers written in SQL so
   clients can't forge rows; in-app center first, web push later.

### W2 — Growth loop: invite links + Google Maps import ⭐
- **Invite links** (section 1 P2 spec) — the viral join mechanism.
- **NEW — Import your Google Maps saved places**: Google Takeout exports
  saved lists as CSV/GeoJSON. An importer (client-side parse → bulk insert
  into a private "Imported" community, then offer per-pin "publish to…")
  converts years of accumulated personal geodata into MapCrowd content in
  one sitting. This is the single best acquisition feature available —
  everyone has a saved-places list and no way to share it as a map.
  Respect rate limits (bulk insert via one RPC, not N inserts, to clear the
  10/min pin trigger — add a SECURITY DEFINER `import_pins()` that batches).

### W3 — Delights, in value order
D2 scavenger hunts (route check-ins — the most on-mission) →
D1 surprise-me dice → D6 community year-in-review → D4 pin postcards →
D3 time-capsule pins → D5 one-year-ago feed items.

### W4 — Embeddable community map (distribution)
`/embed/[slug]` chrome-less route (map + pins only, "made with MapCrowd"
footer) + an iframe snippet in community settings. Requires loosening
`frame-ancestors` for that route only. Every blog embed is a live ad.

### Tentative / parked
- Web push (after in-app notifications prove engagement).
- City ambassador program (ops, not code — starter-kit doc + seeded communities).
- Algorithmic feed ranking; DMs — still no.

---

## 7. Fable design notes — page.tsx decomposition blueprint (2026-07-04)

_The §3/§6 refactor precondition, made concrete so it can be executed as a
sequence of small, always-green PRs (parallel-session safe: each step is
minutes, not hours, of uncommitted state)._

Target: `app/page.tsx` (~1,240 lines) becomes <400 lines of orchestration.
Extract in THIS order — each step independently shippable, build+tests green:

1. **`hooks/useMapStyle.ts`** — mapStyle + localStorage persistence.
   Trivial; proves the pattern and the import layout.
2. **`hooks/useAuthUser.ts`** — user, authReady, myUsername, isAdmin, the
   onAuthStateChange subscription. Everything downstream takes `user` as an
   argument, not from context.
3. **`hooks/useCommunities.ts`** — communities, subscribedIds,
   modCommunityIds/ownedCommunityIds, pendingInvites, groups,
   communityGroupMap + their fetchers and accept/decline/subscribe
   handlers. Exposes `refetch` for modals to call.
4. **`hooks/usePins.ts`** — pins, fetchPins, the realtime channel
   (subscribe/cleanup lives HERE), savedPinIds + toggleSave, followedUserIds
   + toggleFollow.
5. **`hooks/useRouteBuilder.ts`** — the biggest and most isolated cluster:
   routes, routeFolders, activeRouteId, routeStops, builderCommunityId,
   routeTargetStep, externalRoute, routeGeometry/branchGeometry + the
   debounced ORS recompute effect and every route handler. Nothing else
   touches these; this step alone removes ~⅓ of the file.
6. **`hooks/useMapFilters.ts`** — selectedCommunity, showSubscribedOnly,
   showSavedOnly, hiddenCommunityIds (+persistence), activeFolderId,
   selectedTagIds, and the `filteredPins` / `mapPins` derivations (wrap the
   already-tested `selectVisiblePins`).

Cross-cutting rules:
- `selectedPin`, `flyToTarget`, and modal-visibility state STAY in page.tsx
  — they are the coordination layer; hooks never import each other and
  never own navigation.
- Hooks communicate via arguments + returned handlers only (e.g.
  `usePins(user)`), no shared context yet. Add a context/provider ONLY if
  component prop counts still hurt afterwards — try grouped prop objects
  (`sidebarProps`) first; Sidebar's 40-prop signature shrinks to ~6 groups.
- The `overlayOpen`/`modalOpen` derivation stays in page.tsx and must list
  every modal — grep for `setShow.*Modal|setShowWelcome|setShowQuickAdd`
  when done to confirm none were orphaned.
- After extraction, run the full manual loop once on the preview server:
  select community → open pin → vote path → build a route → welcome modal
  reopen. Then (and only then) tackle §3's Sidebar/PinDetailModal splits.

---

## 8. Mobile & web experience scan (measured 2026-07-05, 375x812 viewport)

_Live-tested post-light-theme. The mobile system holds up: welcome modal
renders as a true bottom sheet, no horizontal overflow anywhere tested,
bottom nav 53px with 4 tabs, quick-add FAB 45px, drawer opens at 270px with
a tappable backdrop. Remaining nits:_

1. **Mixed tap-target sizes in the sidebar drawer** — measured rows at
   36/41px with some controls at 26px (folder toggles / small icon
   buttons). On <768px bump list-row vertical padding so every interactive
   row clears ~44px; icon-only buttons get `p-2` minimum.
2. **Hamburger is 38px** — take it to 44px (`h-11 w-11`) since it is the
   single entry point to everything on mobile.
3. Not testable in a browser: long-press flows and pinch on the map — keep
   on the real-device checklist alongside Furnisher's.

---

## 9. Depth roadmap — serving the current user (2026-07-05)

_Direction change: depth over reach. MapCrowd's deepest current users are
community OWNERS/MODS — give them insight into the thing they tend._

### C1 — Community insights for mods (M) ⭐
A tab in CommunitySettingsModal: pins/week trend, active contributors,
top-voted pins, subscriber growth, pending-queue latency. All from
existing tables via 2-3 SECURITY DEFINER aggregate RPCs (mod-gated like
get_community_stats). The mod's "is my community alive?" question,
answered.

### C2 — Personal map yearbook (S)
For any signed-in user: your pins/routes/photos by month, communities
contributed to, votes received — the private analytics behind §4 D6's
shareable wrapped.

### C3 — Route analytics (S)
Per route: total distance by travel mode (geometry exists), elevation gain
(Open-Elevation batch lookup, optional), estimated walking time. Turns
routes into genuinely useful trail cards.

### C4 — Pin lifecycle insight (M, tentative)
For mods: expiry/decay view — how many pins go stale (no votes/comments in
90d), oldest unedited pins — supports a "spring cleaning" queue. Depth for
map QUALITY, which is the real product.

---

## Security & code-quality audit (2026-07-12, Fable portfolio pass)

_This repo is PUBLIC; the security model here is genuinely strong, so all notes are
safe to keep in-repo. (Any future sensitive finding goes to the private home-dir
doc `C:\Users\snoww\PORTFOLIO_SECURITY_AUDIT.md`; nothing needed to go there for
MapCrowd this pass.) Working tree was dirty during the audit — only this file was
staged._

**Security posture: strong.** Verified this pass:
- Client uses only the anon key; **RLS is the boundary**. All 23 tables in
  `schema-current.sql` have RLS enabled. The many `USING (true)` policies are
  SELECT-only on intentionally-public data (profiles, communities, pins, comments,
  photos, tags, follows, events) — correct for a public map.
- Service-role key is server-only (`/api/invite`, `/api/route`); never
  `NEXT_PUBLIC_`. `/api/invite` verifies the caller's JWT, checks community
  ownership, rate-limits invites, and deliberately avoids account-enumeration.
- `/api/route` (ORS proxy) requires a valid JWT, allowlists `profile`, caps
  coordinates 2–50, validates each is finite, and calls a fixed ORS endpoint —
  **not** an open proxy / no SSRF.
- Migration 23 correctly `DROP`s the old fully-permissive `votes_*_all` policies;
  writes now go only through `vote_on_pin()` (SECURITY DEFINER, keyed on
  `auth.uid()`). Storage/pin-insert hardening (26) forces `vote_count=0`.

**O1 — operational (the one real risk): live security depends on the whole
migration chain.** The base migration ships permissive policies that later
migrations (22 security-hardening, 23 abuse/admin, 26 pin-insert) tighten. If the
live DB ever missed one of those, the base hole is open and nothing in the app
would show it. **Recommend:** treat `schema-current.sql` as canonical and
periodically diff it against the live DB (Supabase schema dump), or add a tiny
"policy audit" SQL snippet you can run to assert no `votes` write policy exists and
every table has RLS. Cheap insurance for a public-write app.

**Quality — low priority:**
- `NEXT_PUBLIC_ADMIN_USER_ID` is exposed to the browser (expected — it's a public
  UUID) but must never gate a real permission client-side; the real check is the
  `is_site_admin()` RLS path. Keep it that way; don't add client-only admin gates.
- Lint is not yet a CI gate (known, per AGENTS/CLAUDE) — pre-existing
  `react-hooks/set-state-in-effect` debt. Clear it, then add lint to CI so it can't
  regrow.
- `app/page.tsx` holds ALL map state ("god component"). Not urgent, but the single
  biggest maintainability drag; peel off self-contained slices (routes builder,
  feed) into hooks/contexts as you touch them.
