-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 41 · Personal map yearbook (§9 C2)
--
-- "Your year on MapCrowd" for the signed-in user: pins by month (last 12), plus
-- lifetime votes received, communities contributed to, photos, and routes. Keyed
-- on auth.uid() and returns ONLY the caller's own aggregate — SECURITY DEFINER so
-- it can also count the caller's own routes (RLS own-rows) in one round trip.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_yearbook()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to view your yearbook';
  END IF;

  result := jsonb_build_object(
    -- Pins created per month for the last 12 months (oldest → newest), zero-filled.
    'monthly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('month', to_char(mo, 'YYYY-MM'), 'count', cnt) ORDER BY mo)
      FROM (
        SELECT gs AS mo,
               (SELECT COUNT(*) FROM pins p
                  WHERE p.user_id = v_uid AND date_trunc('month', p.created_at) = gs) AS cnt
        FROM generate_series(
               date_trunc('month', NOW()) - INTERVAL '11 months',
               date_trunc('month', NOW()),
               INTERVAL '1 month'
             ) gs
      ) months
    ), '[]'::jsonb),

    'pins_12mo', (
      SELECT COUNT(*) FROM pins WHERE user_id = v_uid AND created_at > NOW() - INTERVAL '12 months'
    ),
    'votes_received', (SELECT COALESCE(SUM(vote_count), 0)::INT FROM pins WHERE user_id = v_uid),
    'community_count', (SELECT COUNT(DISTINCT community_id) FROM pins WHERE user_id = v_uid),
    'photo_count', (SELECT COUNT(*) FROM pin_photos WHERE user_id = v_uid),
    'route_count', (SELECT COUNT(*) FROM routes WHERE user_id = v_uid)
  );

  RETURN result;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_my_yearbook TO authenticated;
