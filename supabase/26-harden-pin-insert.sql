-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 26 · Harden pin INSERT (server-controlled fields)
--
-- RLS protects WHO can insert a pin, but not WHICH column values they send.
-- A crafted client could otherwise:
--   • set vote_count to a fake-high number (there is no author UPDATE policy,
--     so INSERT was the only opening) — vote integrity issue
--   • set a far-future expires_at to dodge the community's pin-duration policy
--
-- The defaults trigger now forces both: vote_count starts at 0, and expires_at
-- is always derived from the community policy (client value ignored).
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_pin_defaults_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_require_approval     BOOLEAN;
  v_default_pin_duration TEXT;
  v_geo_restriction      JSONB;
  v_outside_geo          BOOLEAN := FALSE;
BEGIN
  SELECT require_approval, default_pin_duration, geo_restriction
    INTO v_require_approval, v_default_pin_duration, v_geo_restriction
    FROM communities WHERE id = NEW.community_id;

  -- New pins always start with a clean score (client cannot pre-inflate it).
  NEW.vote_count := 0;

  IF v_geo_restriction IS NOT NULL THEN
    v_outside_geo := (
      NEW.lat < (v_geo_restriction->>'south')::FLOAT OR
      NEW.lat > (v_geo_restriction->>'north')::FLOAT OR
      NEW.lng < (v_geo_restriction->>'west')::FLOAT  OR
      NEW.lng > (v_geo_restriction->>'east')::FLOAT
    );
  END IF;

  -- Status is always derived from community rules (client cannot self-approve).
  NEW.status := CASE WHEN v_require_approval OR v_outside_geo THEN 'pending' ELSE 'approved' END;

  -- Expiry is always derived from the community policy (client value ignored).
  NEW.expires_at := CASE v_default_pin_duration
    WHEN '1d'  THEN NOW() + INTERVAL  '1 day'
    WHEN '7d'  THEN NOW() + INTERVAL  '7 days'
    WHEN '30d' THEN NOW() + INTERVAL '30 days'
    WHEN '90d' THEN NOW() + INTERVAL '90 days'
    ELSE NULL -- 'permanent'
  END;

  RETURN NEW;
END; $$;
