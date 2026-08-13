-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 44 · Community invite links (§2 — growth loop)
--
-- A copyable join link, the viral complement to the username/email invites. Mods
-- mint tokens (optional expiry + use cap); anyone opening /join/<token> redeems it
-- through the SECURITY DEFINER redeem_invite() RPC, which adds them as an accepted
-- member (private communities) and subscribes them. RLS lets only mods see/manage
-- the link rows; redemption never needs to read them directly.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_invite_links (
  token        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  created_by   UUID                 REFERENCES profiles(id)    ON DELETE SET NULL,
  expires_at   TIMESTAMPTZ,          -- null = never expires
  max_uses     INT,                  -- null = unlimited
  use_count    INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invite_links_community_idx ON community_invite_links (community_id);

ALTER TABLE community_invite_links ENABLE ROW LEVEL SECURITY;

-- Only mods (owner / assigned mod / site admin, via is_community_mod) can read or
-- manage a community's links. Invitees never select here — they use redeem_invite.
DROP POLICY IF EXISTS "invite_links_mod_all" ON community_invite_links;
CREATE POLICY "invite_links_mod_all" ON community_invite_links FOR ALL
  USING      (public.is_community_mod(community_id))
  WITH CHECK (public.is_community_mod(community_id));

-- Redeem a link: validate, join, subscribe, bump the counter. Returns the
-- community's slug + name so the /join page can land the user on /c/<slug>.
CREATE OR REPLACE FUNCTION public.redeem_invite(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_link    community_invite_links%ROWTYPE;
  v_slug    TEXT;
  v_name    TEXT;
  v_private BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join';
  END IF;

  SELECT * INTO v_link FROM community_invite_links WHERE token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This invite link is invalid';
  END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < NOW() THEN
    RAISE EXCEPTION 'This invite link has expired';
  END IF;
  IF v_link.max_uses IS NOT NULL AND v_link.use_count >= v_link.max_uses THEN
    RAISE EXCEPTION 'This invite link has reached its use limit';
  END IF;

  SELECT slug, name, is_private INTO v_slug, v_name, v_private
    FROM communities WHERE id = v_link.community_id;

  -- Private communities gate on membership; add an accepted row (idempotent).
  IF v_private THEN
    INSERT INTO community_members (community_id, user_id, invited_by, status)
      VALUES (v_link.community_id, v_uid, v_link.created_by, 'accepted')
      ON CONFLICT (community_id, user_id) DO UPDATE SET status = 'accepted';
  END IF;

  INSERT INTO community_subscriptions (community_id, user_id)
    VALUES (v_link.community_id, v_uid)
    ON CONFLICT DO NOTHING;

  UPDATE community_invite_links SET use_count = use_count + 1 WHERE token = p_token;

  RETURN jsonb_build_object('slug', v_slug, 'name', v_name);
END; $$;

GRANT EXECUTE ON FUNCTION public.redeem_invite TO authenticated;
