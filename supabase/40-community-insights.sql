-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 40 · Community insights for mods (§9 C1)
--
-- Answers a community owner/mod's "is my community alive?" — pins/week trend,
-- recent contributors, subscriber growth, top-voted pins, and how backed-up the
-- moderation queue is. One SECURITY DEFINER RPC, mod-gated (is_community_mod, which
-- already covers owner + site admin) so it can read across RLS to aggregate; it
-- exposes only counts + public pin titles, never any private/per-user rows.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_community_insights(p_community_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_community_mod(p_community_id) THEN
    RAISE EXCEPTION 'Not authorized to view this community''s insights';
  END IF;

  result := jsonb_build_object(
    -- Pins created per week for the last 8 ISO weeks (oldest → newest), zero-filled.
    'weekly', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('week', to_char(wk, 'YYYY-MM-DD'), 'count', cnt) ORDER BY wk
      )
      FROM (
        SELECT gs AS wk,
               (SELECT COUNT(*) FROM pins p
                  WHERE p.community_id = p_community_id
                    AND date_trunc('week', p.created_at) = gs) AS cnt
        FROM generate_series(
               date_trunc('week', NOW()) - INTERVAL '7 weeks',
               date_trunc('week', NOW()),
               INTERVAL '1 week'
             ) gs
      ) weeks
    ), '[]'::jsonb),

    -- Distinct signed-in authors who dropped a pin in the last 30 days.
    'contributors_30d', (
      SELECT COUNT(DISTINCT user_id) FROM pins
       WHERE community_id = p_community_id
         AND user_id IS NOT NULL
         AND created_at > NOW() - INTERVAL '30 days'
    ),

    'subscriber_count', (
      SELECT COUNT(*) FROM community_subscriptions WHERE community_id = p_community_id
    ),
    'subscribers_30d', (
      SELECT COUNT(*) FROM community_subscriptions
       WHERE community_id = p_community_id
         AND created_at > NOW() - INTERVAL '30 days'
    ),

    -- Top 5 live pins by score.
    'top_pins', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('id', id, 'title', title, 'vote_count', vote_count)
        ORDER BY vote_count DESC
      )
      FROM (
        SELECT id, title, vote_count FROM pins
         WHERE community_id = p_community_id
           AND status = 'approved'
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY vote_count DESC
         LIMIT 5
      ) tp
    ), '[]'::jsonb),

    -- Moderation queue backlog.
    'pending_count', (
      SELECT COUNT(*) FROM pins WHERE community_id = p_community_id AND status = 'pending'
    ),
    'oldest_pending_hours', (
      SELECT ROUND(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 3600)::INT
        FROM pins WHERE community_id = p_community_id AND status = 'pending'
    )
  );

  RETURN result;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_community_insights TO authenticated;
