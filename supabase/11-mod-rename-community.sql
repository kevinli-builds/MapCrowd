-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd Migration 11 — Rename community (owner OR mod)
--
-- The existing UPDATE policy only allows the community owner to update rows.
-- Mods are trusted users who should be able to rename without being the owner.
-- We use a SECURITY DEFINER function to check mod status server-side and
-- perform the targeted name-only update, so mods cannot touch other columns.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rename_community(
  p_community_id UUID,
  p_new_name     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate length (mirrors the DB CHECK constraint)
  IF char_length(trim(p_new_name)) < 1 OR char_length(trim(p_new_name)) > 50 THEN
    RAISE EXCEPTION 'Community name must be between 1 and 50 characters';
  END IF;

  -- Caller must be the owner OR an assigned moderator
  IF NOT (
    EXISTS (
      SELECT 1 FROM communities
      WHERE id = p_community_id AND created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM community_moderators
      WHERE community_id = p_community_id AND user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to rename this community';
  END IF;

  UPDATE communities
  SET    name = trim(p_new_name)
  WHERE  id   = p_community_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_community TO authenticated;
