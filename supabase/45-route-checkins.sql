-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 45 · Scavenger-hunt route check-ins (§4 D2)
--
-- Turns a route into a game: while viewing a route you can "check in" at a stop
-- you're standing near (the client checks GPS distance ~75m, then inserts). Own-rows
-- only — a check-in is self-attested, so distance is a client-side game rule, not a
-- security boundary. Progress + a finisher moment are derived client-side.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.route_checkins (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id   UUID        NOT NULL REFERENCES routes(id)     ON DELETE CASCADE,
  pin_id     UUID        NOT NULL REFERENCES pins(id)       ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, route_id, pin_id)
);

CREATE INDEX IF NOT EXISTS route_checkins_user_route_idx ON route_checkins (user_id, route_id);

ALTER TABLE route_checkins ENABLE ROW LEVEL SECURITY;

-- You manage only your own check-ins.
DROP POLICY IF EXISTS "route_checkins_own" ON route_checkins;
CREATE POLICY "route_checkins_own" ON route_checkins FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
