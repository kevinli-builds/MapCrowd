-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 43 · Community "Wrapped" year-in-review (§4 D6)
--
-- The headline numbers behind a shareable per-community story card: totals + this
-- year's pins, contributors, subscriber growth, the top pin, the most-RSVP'd event,
-- and how many public routes the community has. Mod-gated (matches the Insights tab
-- it's launched from); exposes only counts + public titles.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_community_wrapped(p_community_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result JSONB; v_name TEXT; v_icon TEXT; v_color TEXT;
BEGIN
  IF NOT public.is_community_mod(p_community_id) THEN
    RAISE EXCEPTION 'Not authorized to view this community''s wrapped';
  END IF;

  SELECT name, icon, color INTO v_name, v_icon, v_color FROM communities WHERE id = p_community_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Community not found'; END IF;

  result := jsonb_build_object(
    'name', v_name, 'icon', v_icon, 'color', v_color,
    'total_pins', (
      SELECT COUNT(*) FROM pins
       WHERE community_id = p_community_id AND status = 'approved' AND (expires_at IS NULL OR expires_at > NOW())
    ),
    'pins_this_year', (
      SELECT COUNT(*) FROM pins WHERE community_id = p_community_id AND created_at > NOW() - INTERVAL '1 year'
    ),
    'contributors', (
      SELECT COUNT(DISTINCT user_id) FROM pins WHERE community_id = p_community_id AND user_id IS NOT NULL
    ),
    'subscriber_count', (SELECT COUNT(*) FROM community_subscriptions WHERE community_id = p_community_id),
    'new_subscribers_year', (
      SELECT COUNT(*) FROM community_subscriptions
       WHERE community_id = p_community_id AND created_at > NOW() - INTERVAL '1 year'
    ),
    'route_count', (SELECT COUNT(*) FROM routes WHERE community_id = p_community_id AND is_public),
    'top_pin', (
      SELECT jsonb_build_object('title', title, 'vote_count', vote_count) FROM pins
       WHERE community_id = p_community_id AND status = 'approved' AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY vote_count DESC LIMIT 1
    ),
    'top_event', (
      SELECT jsonb_build_object('title', p.title, 'going', r.cnt)
      FROM pins p
      JOIN (SELECT pin_id, COUNT(*) AS cnt FROM event_rsvps GROUP BY pin_id) r ON r.pin_id = p.id
      WHERE p.community_id = p_community_id AND p.event_date IS NOT NULL
      ORDER BY r.cnt DESC LIMIT 1
    )
  );

  RETURN result;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_community_wrapped TO authenticated;
