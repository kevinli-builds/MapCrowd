-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 38 · Bulk import of saved places (Google Maps Takeout)
--
-- Lets a user turn their exported Google Maps saved places into pins in one
-- sitting. A naive client loop would trip the 10/min pin rate-limit (migration
-- 23) after ten inserts, so imports go through ONE SECURITY DEFINER RPC that:
--   • verifies the caller is a mod/owner of the target community (import is only
--     ever into a community you control — the UI creates a private one for you);
--   • caps the batch size (500) so it can't be used to mass-spam;
--   • sets a transaction-local flag that the rate-limit trigger honours to skip
--     the per-minute cap for this trusted, size-capped path only;
--   • validates + clamps every row to the pins CHECK constraints (title 1–100,
--     description ≤500, url http(s) ≤500, lat/lng in range) and SKIPS any row
--     that doesn't fit rather than failing the whole batch.
--
-- The set_pin_defaults_on_insert trigger still runs per row, so status /
-- expires_at / vote_count remain server-controlled exactly as for normal pins.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Teach the rate-limit trigger to stand down for the bulk-import path.
--    current_setting(..., true) returns NULL when unset (missing_ok), so normal
--    inserts are unaffected. import_pins sets it transaction-local before looping.
CREATE OR REPLACE FUNCTION public.check_pin_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_minute INT; v_hour INT;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  -- Trusted, size-capped bulk import (see import_pins) bypasses the per-actor cap.
  IF current_setting('mapcrowd.bulk_import', true) = 'on' THEN RETURN NEW; END IF;

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


-- 2. import_pins(community, places[]) → number of pins created.
--    p_places is a JSON array of { title, note?, url?, lat, lng }.
CREATE OR REPLACE FUNCTION public.import_pins(
  p_community_id UUID,
  p_places       JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_elem  JSONB;
  v_title TEXT;
  v_desc  TEXT;
  v_url   TEXT;
  v_lat   DOUBLE PRECISION;
  v_lng   DOUBLE PRECISION;
  v_count INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to import places';
  END IF;

  IF NOT public.is_community_mod(p_community_id) THEN
    RAISE EXCEPTION 'Not authorized to import into this community';
  END IF;

  IF p_places IS NULL OR jsonb_typeof(p_places) <> 'array' THEN
    RAISE EXCEPTION 'places must be a JSON array';
  END IF;

  IF jsonb_array_length(p_places) > 500 THEN
    RAISE EXCEPTION 'Too many places in one import (max 500)';
  END IF;

  -- Transaction-local: lets check_pin_rate_limit skip the per-minute cap while
  -- this trusted, size-capped batch runs. Cleared automatically at commit.
  PERFORM set_config('mapcrowd.bulk_import', 'on', true);

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_places)
  LOOP
    -- Per-row guard: a single malformed row is skipped, not fatal to the batch.
    BEGIN
      v_title := btrim(v_elem->>'title');
      IF v_title IS NULL OR char_length(v_title) < 1 OR char_length(v_title) > 100 THEN
        CONTINUE;
      END IF;

      v_lat := (v_elem->>'lat')::DOUBLE PRECISION;
      v_lng := (v_elem->>'lng')::DOUBLE PRECISION;
      IF v_lat IS NULL OR v_lng IS NULL
         OR v_lat < -90 OR v_lat > 90 OR v_lng < -180 OR v_lng > 180 THEN
        CONTINUE;
      END IF;

      v_desc := NULLIF(btrim(COALESCE(v_elem->>'note', '')), '');
      IF v_desc IS NOT NULL THEN v_desc := left(v_desc, 500); END IF;

      v_url := btrim(COALESCE(v_elem->>'url', ''));
      IF v_url = '' OR v_url !~* '^https?://' OR char_length(v_url) > 500 THEN
        v_url := NULL;
      END IF;

      INSERT INTO pins (community_id, user_id, title, description, lat, lng, url)
      VALUES (p_community_id, v_uid, v_title, v_desc, v_lat, v_lng, v_url);

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Skip any row that still violates a constraint; keep importing the rest.
      CONTINUE;
    END;
  END LOOP;

  RETURN v_count;
END; $$;

GRANT EXECUTE ON FUNCTION public.import_pins TO authenticated;
