# Check-ins & Outings — Feature Spec

**Status:** Draft / proposal (no code yet)
**Author:** design pass, 2026-07-06
**Depends on:** existing `pins`, `follows`, `communities`, `community_members`, RLS + SECURITY DEFINER conventions (see [CLAUDE.md](./CLAUDE.md)).

---

## 1. Problem

A group of friends planning a day out in a community ("Fun Bars", "Street Art")
have no way to say **"I'm here right now"** or to see **where everyone else is**.
The closest primitives today are:

- **Event RSVP ("Going")** — future intent, tied to a scheduled *event pin* with a
  date/capacity (`event_rsvps` + `toggle_event_rsvp()`). Not "I'm here now".
- **Near Me** — geolocates you and flies the map there, but it's ephemeral and
  private; nothing is stored or shared.
- **QuickAdd** — GPS drops a *public pin*, not a personal presence signal.

This spec adds **live check-ins** (present-tense "I'm at this location") and, on top
of them, **outings** (an ad-hoc, shareable session for a specific group of people).

## 2. Terminology (avoid the naming collision)

> ⚠️ **"Group" is already taken.** `community_groups` in this codebase are *personal
> sidebar folders* for organizing your own subscriptions — **not** shared groups of
> people. To avoid confusion we do **not** call the people-group a "group".

| Term | Meaning |
|---|---|
| **Check-in** | A user's present-tense "I'm at this pin now", auto-expiring. |
| **Outing** | An ad-hoc, time-boxed session within one community that a set of people join (via link) to coordinate a day out. |
| **Candidate pin** | A pin added to an outing's shortlist ("where might we go"). |

## 3. Non-goals (at least initially)

- **No raw/continuous GPS sharing.** Check-ins snap to *existing pins* (coarse,
  public places) — we never store or broadcast a user's exact live coordinates.
  This is a deliberate privacy property, not a limitation to fix later.
- **No persistent, roster-managed "clubs".** Outings are ephemeral and auto-archive.
- **No cross-community outings** in v1 (an outing belongs to exactly one community).

## 4. Phasing

The two halves are separable and one is far cheaper. **Ship Phase 1 alone first** —
it delivers most of the "where's everyone at?" value using only primitives that
already exist.

- **Phase 1 — Live check-ins**, visibility scoped to the people you **follow**.
  New: one table, one helper, two RPCs, a button + a presence layer on the map.
- **Phase 2 — Outings**, the ad-hoc group that makes check-ins visible to a
  specific party regardless of follow relationships.

---

## 5. Phase 1 — Live check-ins

### 5.1 Data model (`supabase/38-checkins.sql`)

```sql
CREATE TABLE IF NOT EXISTS check_ins (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_id     UUID NOT NULL REFERENCES pins(id)        ON DELETE CASCADE,
  note       TEXT,                                    -- optional "grabbing coffee, join!"
  outing_id  UUID,                                    -- Phase 2 FK, nullable; added in mig 39
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '4 hours'
);

-- A user is in one place at a time: the check-in RPC clears prior active rows.
CREATE INDEX IF NOT EXISTS check_ins_pin_active_idx  ON check_ins (pin_id, expires_at);
CREATE INDEX IF NOT EXISTS check_ins_user_active_idx ON check_ins (user_id, expires_at);

ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
```

`note` is user free-text → **must be `escapeHtml()`'d anywhere it's rendered in a
Leaflet `divIcon`** (same rule as pin titles; see the security-model note in
CLAUDE.md). Consider a `CHECK (char_length(note) <= 140)` constraint.

### 5.2 Visibility (RLS)

The crux of the whole feature. Default = **followers-only**, never the whole
community.

```sql
-- You can see a check-in if it's yours, OR you follow that user,
-- OR (Phase 2) you're in the same outing. Expiry is filtered in queries/RPC,
-- not RLS, so a user can still read/refresh their own expired row.
CREATE POLICY "checkins_select_visible" ON check_ins
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM follows f
      WHERE f.follower_id = auth.uid() AND f.followee_id = check_ins.user_id
    )
    -- OR (outing_id IS NOT NULL AND is_outing_member(outing_id))   -- added in mig 39
  );

-- Writes go only through the RPCs below (SECURITY DEFINER); no direct client writes.
-- (Deliberately no INSERT/UPDATE policy — mirrors how votes are RPC-only.)
CREATE POLICY "checkins_delete_own" ON check_ins
  FOR DELETE USING (auth.uid() = user_id);
```

### 5.3 RPCs

```sql
-- Check in: clears the caller's other ACTIVE check-ins (one location at a time),
-- then inserts a fresh one. Refreshing the same pin just extends expiry.
CREATE OR REPLACE FUNCTION check_in(
  p_pin_id UUID, p_note TEXT DEFAULT NULL, p_outing_id UUID DEFAULT NULL
) RETURNS check_ins AS $$
DECLARE v_user UUID := auth.uid(); v_row check_ins;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM check_ins WHERE user_id = v_user AND expires_at > NOW();
  INSERT INTO check_ins (user_id, pin_id, note, outing_id)
    VALUES (v_user, p_pin_id, NULLIF(TRIM(p_note), ''), p_outing_id)
    RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;   -- mig-22 rule

-- Explicit check out
CREATE OR REPLACE FUNCTION check_out() RETURNS VOID AS $$
BEGIN
  DELETE FROM check_ins WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

> **Note the `SET search_path = public`** on every SECURITY DEFINER function —
> required by migration 22's hardening. Migration 17's `toggle_event_rsvp` predates
> that and was retrofitted; don't copy its (older) signature.

Expired rows are harmless (queries filter `expires_at > now()`); a periodic cleanup
(`pg_cron` nightly `DELETE ... WHERE expires_at < now()`) keeps the table small but
isn't correctness-critical.

### 5.4 TypeScript (`lib/types.ts`)

```ts
export interface CheckIn {
  id: string
  user_id: string
  pin_id: string
  note: string | null
  outing_id: string | null
  created_at: string
  expires_at: string
  profile?: Pick<Profile, 'username' | 'avatar_url'> | null
}
```

### 5.5 UI touchpoints

- **`PinDetailModal`** — primary surface. A **"I'm here"** button (→ `check_in`),
  becoming **"Check out"** when active. Below it, a row of avatars of *people you
  follow* currently checked in here, each with their optional note.
- **`PinClusterLayer` / `MapInner`** — pins with active friend check-ins get a small
  presence badge (e.g. a count or stacked avatars). Remember `escapeHtml` + `safeColor`.
- **Realtime** — subscribe to a `check_ins` Supabase channel so presence updates live
  (MapCrowd already uses Realtime channels elsewhere).
- **Global privacy toggle** — a profile setting "appear checked-in to followers"
  (default on) so a user can go dark without checking out each time.

### 5.6 Why Phase 1 stands alone

It answers "where's everyone at?" during a day out using only `pins` + `follows` +
RLS. No new group concept, no invites, no membership. If you and your friends already
follow each other, it just works.

---

## 6. Phase 2 — Outings (`supabase/39-outings.sql`)

For a party that *isn't* a mutual-follow clique, or to keep a day's check-ins visible
to exactly the people on the outing (and no other followers).

### 6.1 Data model

```sql
CREATE TABLE IF NOT EXISTS outings (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  creator_id   UUID NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  name         TEXT NOT NULL,
  join_code    TEXT NOT NULL UNIQUE,                    -- shareable link token
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE TABLE IF NOT EXISTS outing_members (
  outing_id UUID NOT NULL REFERENCES outings(id)     ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',           -- 'owner' | 'member'
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (outing_id, user_id)
);

CREATE TABLE IF NOT EXISTS outing_pins (               -- candidate shortlist
  outing_id UUID NOT NULL REFERENCES outings(id) ON DELETE CASCADE,
  pin_id    UUID NOT NULL REFERENCES pins(id)    ON DELETE CASCADE,
  added_by  UUID REFERENCES auth.users(id),
  position  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (outing_id, pin_id)
);

-- Then wire the Phase-1 FK:
ALTER TABLE check_ins
  ADD CONSTRAINT check_ins_outing_fk
  FOREIGN KEY (outing_id) REFERENCES outings(id) ON DELETE SET NULL;
```

### 6.2 RLS — break the recursion with a helper

Same pattern as `check_community_member()` (migration 09): a SECURITY DEFINER helper
lets `outings` / `outing_pins` policies test membership without RLS recursion on
`outing_members`.

```sql
CREATE OR REPLACE FUNCTION is_outing_member(p_outing_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM outing_members
    WHERE outing_id = p_outing_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;
```

- `outings` SELECT: `is_outing_member(id)` OR `creator_id = auth.uid()`.
- `outing_members` SELECT: `is_outing_member(outing_id)`.
- `outing_pins` SELECT/INSERT/DELETE: `is_outing_member(outing_id)`.
- Extend the Phase-1 check-in policy with the commented-out
  `OR (outing_id IS NOT NULL AND is_outing_member(outing_id))` clause.

### 6.3 RPCs

- `create_outing(p_community_id, p_name)` → inserts the outing, adds creator as
  `owner`, returns the row (with `join_code`).
- `join_outing(p_join_code)` → resolves code → adds caller as `member`
  (idempotent), returns the outing.
- Leaving = `DELETE FROM outing_members` (self row via RLS).

### 6.4 UI touchpoints

- **Start an outing** from a community (`CommunityPinsPanel` header or a new sidebar
  **"Outings"** section — *not* the community_groups folders).
- **Share link** `/?outing=<join_code>` → opens a join sheet.
- **Outing view** — the member list with live check-in status, plus the candidate-pin
  shortlist; tapping a candidate flies the map to it. Check-ins made while an outing
  is "active" carry its `outing_id`.
- Auto-archive after `expires_at` (extendable by the owner).

---

## 7. Privacy & safety (call these out explicitly)

- **Opt-in, per-action.** Nothing is shared until you tap "I'm here".
- **Auto-expiry + one active location.** You can't accidentally leave your location
  broadcasting for days; there's always a one-tap "Check out".
- **Coarse by construction.** Check-ins reference public pins, never raw GPS.
- **Scoped visibility.** Followers-only (Phase 1) or outing-only (Phase 2) — never
  the entire public community unless we later add an explicit "share with community"
  opt-in.
- **Blocking / appear-offline.** A global "appear checked-in to followers" toggle;
  revisit if/when a block feature lands.

## 8. Open decisions (need your call before code)

1. **Check into a pin, or any lat/lng?** Recommendation: **pin-only** (privacy +
   fits MapCrowd's pin-centric model). Arbitrary points would need a whole presence
   layer and raw-location storage.
2. **Default visibility:** followers-only vs. outing-only vs. an opt-in
   community-wide mode. Recommendation: **followers-only in Phase 1**, add
   outing-only in Phase 2, defer community-wide.
3. **Persistent people-groups vs. ephemeral outings.** Recommendation: **ephemeral
   outings** (auto-archive) — matches "a day out" and avoids a roster/roles build.
4. **Expiry window** default (proposed 4h for check-ins, 24h for outings) — tune to taste.

## 9. Rollout / conventions checklist

- [ ] `supabase/38-checkins.sql`, then `39-outings.sql` — `IF NOT EXISTS` /
      `CREATE OR REPLACE` throughout so they're re-runnable.
- [ ] Fold both into `supabase/schema-current.sql` (the fresh-project file).
- [ ] Every SECURITY DEFINER function pins `SET search_path = public` (mig-22 rule).
- [ ] Any check-in `note` rendered in a Leaflet `divIcon` goes through `escapeHtml()`.
- [ ] Add `CheckIn` / `Outing` types to `lib/types.ts`; cover any new pure helpers
      with vitest (`lib/*.test.ts`).
- [ ] Update `CLAUDE.md` "Features built" + schema table once shipped.
```
