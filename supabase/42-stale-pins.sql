-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 42 · Pin lifecycle / "spring cleaning" for mods (§9 C4)
--
-- Surfaces stale pins so mods can keep the map's QUALITY up: approved, still-live
-- pins that are >90 days old, have no net upvotes, and have had no comment in the
-- last 90 days — the "nobody has engaged with this in ages" set. Mod-gated; the
-- mod can then remove them (the existing is_pin_owner_or_mod delete policy).
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_stale_pins(p_community_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_community_mod(p_community_id) THEN
    RAISE EXCEPTION 'Not authorized to view this community''s pins';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'title', title, 'created_at', created_at,
      'vote_count', vote_count, 'comment_count', comment_count
    ) ORDER BY created_at ASC
  ), '[]'::jsonb)
  INTO result
  FROM (
    SELECT s.id, s.title, s.created_at, s.vote_count, s.comment_count
    FROM (
      SELECT p.id, p.title, p.created_at, p.vote_count,
             (SELECT COUNT(*) FROM comments c WHERE c.pin_id = p.id) AS comment_count,
             (SELECT MAX(c.created_at) FROM comments c WHERE c.pin_id = p.id) AS last_comment
      FROM pins p
      WHERE p.community_id = p_community_id
        AND p.status = 'approved'
        AND (p.expires_at IS NULL OR p.expires_at > NOW())
        AND p.created_at < NOW() - INTERVAL '90 days'
        AND p.vote_count <= 0
    ) s
    WHERE s.last_comment IS NULL OR s.last_comment < NOW() - INTERVAL '90 days'
    ORDER BY s.created_at ASC
    LIMIT 50
  ) capped;

  RETURN result;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_stale_pins TO authenticated;
