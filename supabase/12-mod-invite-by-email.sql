-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd Migration 12 — Add moderator by email
--
-- Owners can already add mods by searching usernames (direct RLS insert).
-- This function lets them paste an email address instead.  It looks up
-- auth.users (requires SECURITY DEFINER to read that table), then inserts
-- into community_moderators if the caller is owner or an existing mod.
--
-- Returns:
--   { found: false }                          — no account with that email
--   { found: true, user_id, username }        — added (or already a mod)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_mod_by_email(
  p_community_id UUID,
  p_email        TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_username TEXT;
BEGIN
  -- Caller must be the community owner or an assigned mod
  IF NOT (
    EXISTS (SELECT 1 FROM communities       WHERE id           = p_community_id AND created_by   = auth.uid())
    OR EXISTS (SELECT 1 FROM community_moderators WHERE community_id = p_community_id AND user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to add moderators to this community';
  END IF;

  -- Look up user by email (auth.users is accessible inside SECURITY DEFINER)
  SELECT id INTO v_user_id
  FROM   auth.users
  WHERE  lower(email) = lower(trim(p_email))
  LIMIT  1;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('found', false);
  END IF;

  -- Fetch display name from profiles
  SELECT username INTO v_username FROM profiles WHERE id = v_user_id;

  -- Insert mod row; silently skip if already a mod
  INSERT INTO community_moderators (community_id, user_id, assigned_by)
  VALUES (p_community_id, v_user_id, auth.uid())
  ON CONFLICT (community_id, user_id) DO NOTHING;

  RETURN json_build_object('found', true, 'user_id', v_user_id::text, 'username', v_username);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_mod_by_email TO authenticated;
