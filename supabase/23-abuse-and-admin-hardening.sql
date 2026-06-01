-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 23 · Abuse resistance + real site-admin
--
-- Closes the lower-severity items from the security sweep:
--   A. Rate limiting on pin creation and follows (Postgres triggers)
--   B. Votes: lock the table down to the vote_on_pin() RPC and make voting
--      authenticated + one-per-user (kills the open-RLS + vote-stuffing issues)
--   C. Site admin: enforced in RLS (was client-only / non-functional)
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══ A. RATE LIMITING ════════════════════════════════════════════════════════
-- Per-actor caps enforced in BEFORE INSERT triggers. Authenticated only —
-- anonymous pins (user_id NULL) can't be tracked per-actor here; IP-based
-- limiting for those needs an edge/middleware layer (see report).

CREATE OR REPLACE FUNCTION public.check_pin_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_minute INT; v_hour INT;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_minute FROM pins
   WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '1 minute';
  IF v_minute >= 10 THEN
    RAISE EXCEPTION 'Rate limit: too many pins in the last minute — please slow down.';
  END IF;

  SELECT COUNT(*) INTO v_hour FROM pins
   WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '1 hour';
  IF v_hour >= 100 THEN
    RAISE EXCEPTION 'Rate limit: too many pins in the last hour — please try again later.';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS pins_rate_limit ON pins;
-- Name sorts before pins_set_defaults_on_insert, so the cap is checked first.
CREATE TRIGGER pins_rate_limit BEFORE INSERT ON pins
  FOR EACH ROW EXECUTE FUNCTION public.check_pin_rate_limit();

CREATE OR REPLACE FUNCTION public.check_follow_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_minute INT;
BEGIN
  SELECT COUNT(*) INTO v_minute FROM follows
   WHERE follower_id = NEW.follower_id AND created_at > NOW() - INTERVAL '1 minute';
  IF v_minute >= 30 THEN
    RAISE EXCEPTION 'Rate limit: too many follows in a short time — please slow down.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS follows_rate_limit ON follows;
CREATE TRIGGER follows_rate_limit BEFORE INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION public.check_follow_rate_limit();


-- ═══ B. VOTES: authenticated, one-per-user, RPC-only ═════════════════════════

-- Tie votes to the authenticated user (legacy rows keep session_id, user_id NULL)
ALTER TABLE votes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE votes ALTER COLUMN session_id DROP NOT NULL;

-- One vote per (pin, user) for the new auth-based path
CREATE UNIQUE INDEX IF NOT EXISTS votes_pin_user_uniq
  ON votes (pin_id, user_id) WHERE user_id IS NOT NULL;

-- Lock the table: no direct writes (all go through vote_on_pin), read only own rows
DROP POLICY IF EXISTS "votes_insert_all" ON votes;
DROP POLICY IF EXISTS "votes_update_all" ON votes;
DROP POLICY IF EXISTS "votes_delete_all" ON votes;
DROP POLICY IF EXISTS "votes_select_all" ON votes;
CREATE POLICY "votes_select_own" ON votes FOR SELECT USING (auth.uid() = user_id);

-- Rewrite the RPC: require auth, key on auth.uid() (so new session ids can't
-- be minted to vote repeatedly). Keeps the same signature for the client.
CREATE OR REPLACE FUNCTION public.vote_on_pin(
  p_pin_id     UUID,
  p_session_id TEXT,
  p_value      SMALLINT
)
RETURNS public.pins LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  existing_value SMALLINT;
  result_pin     public.pins;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to vote';
  END IF;
  IF p_value NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid vote value';
  END IF;

  SELECT value INTO existing_value
    FROM votes WHERE pin_id = p_pin_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO votes (pin_id, session_id, user_id, value)
      VALUES (p_pin_id, p_session_id, v_user_id, p_value);
    UPDATE pins SET vote_count = vote_count + p_value WHERE id = p_pin_id;
  ELSIF existing_value = p_value THEN
    DELETE FROM votes WHERE pin_id = p_pin_id AND user_id = v_user_id;
    UPDATE pins SET vote_count = vote_count - p_value WHERE id = p_pin_id;
  ELSE
    UPDATE votes SET value = p_value WHERE pin_id = p_pin_id AND user_id = v_user_id;
    UPDATE pins SET vote_count = vote_count + (p_value - existing_value) WHERE id = p_pin_id;
  END IF;

  SELECT * INTO result_pin FROM pins WHERE id = p_pin_id;
  RETURN result_pin;
END; $$;


-- ═══ C. SITE ADMIN enforced in RLS ═══════════════════════════════════════════

-- Membership table (no RLS policies → only SECURITY DEFINER funcs can read it).
CREATE TABLE IF NOT EXISTS public.site_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE site_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_site_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM site_admins WHERE user_id = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.is_site_admin TO anon, authenticated;

-- A site admin is treated as a moderator of every community. This flows through
-- every policy/function already built on is_community_mod (pin update/delete,
-- tags, comment/photo deletion, rename_community, add_mod_by_email).
CREATE OR REPLACE FUNCTION public.is_community_mod(p_community_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_site_admin()
    OR EXISTS (SELECT 1 FROM communities         WHERE id           = p_community_id AND created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM community_moderators WHERE community_id = p_community_id AND user_id    = auth.uid());
$$;

-- Admin can also update / delete any community and manage its mods (these
-- policies don't go through is_community_mod).
DROP POLICY IF EXISTS "communities_update_by_owner" ON communities;
CREATE POLICY "communities_update_by_owner" ON communities FOR UPDATE
  USING      (created_by = auth.uid() OR public.is_site_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_site_admin());

DROP POLICY IF EXISTS "communities_delete_owner" ON communities;
CREATE POLICY "communities_delete_owner" ON communities FOR DELETE
  USING (created_by = auth.uid() OR public.is_site_admin());

DROP POLICY IF EXISTS "mods_insert_owner" ON community_moderators;
CREATE POLICY "mods_insert_owner" ON community_moderators FOR INSERT
  WITH CHECK (community_id IN (SELECT id FROM communities WHERE created_by = auth.uid()) OR public.is_site_admin());

DROP POLICY IF EXISTS "mods_delete_owner" ON community_moderators;
CREATE POLICY "mods_delete_owner" ON community_moderators FOR DELETE
  USING (community_id IN (SELECT id FROM communities WHERE created_by = auth.uid()) OR public.is_site_admin());

-- ⚠️ Seed your admin user so the client ADMIN_USER_ID matches RLS. Replace the
-- UUID with the same value as NEXT_PUBLIC_ADMIN_USER_ID, then run:
--
--   INSERT INTO site_admins (user_id) VALUES ('<your-admin-uuid>')
--   ON CONFLICT DO NOTHING;
