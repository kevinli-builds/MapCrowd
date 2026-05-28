-- Migration 14: Require mod approval when a pin is dropped outside the community's geo restriction.
-- Run AFTER migration 13 (which added the geo_restriction column).
-- Updates the existing set_pin_defaults_on_insert trigger to also check the bounding box.

CREATE OR REPLACE FUNCTION set_pin_defaults_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_require_approval     BOOLEAN;
  v_default_pin_duration TEXT;
  v_geo_restriction      JSONB;
  v_outside_geo          BOOLEAN := FALSE;
BEGIN
  SELECT require_approval, default_pin_duration, geo_restriction
    INTO v_require_approval, v_default_pin_duration, v_geo_restriction
    FROM communities
   WHERE id = NEW.community_id;

  -- Check whether the pin falls outside the community's geographic bounding box
  IF v_geo_restriction IS NOT NULL THEN
    v_outside_geo := (
      NEW.lat < (v_geo_restriction->>'south')::FLOAT OR
      NEW.lat > (v_geo_restriction->>'north')::FLOAT OR
      NEW.lng < (v_geo_restriction->>'west')::FLOAT  OR
      NEW.lng > (v_geo_restriction->>'east')::FLOAT
    );
  END IF;

  -- Pending if community requires approval OR if pin is outside the geo restriction
  NEW.status := CASE
    WHEN v_require_approval OR v_outside_geo THEN 'pending'
    ELSE 'approved'
  END;

  -- Set expiry unless the client explicitly provided one (override allowed for future use)
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := CASE v_default_pin_duration
      WHEN '1d'  THEN NOW() + INTERVAL  '1 day'
      WHEN '7d'  THEN NOW() + INTERVAL  '7 days'
      WHEN '30d' THEN NOW() + INTERVAL '30 days'
      WHEN '90d' THEN NOW() + INTERVAL '90 days'
      ELSE NULL -- 'permanent'
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- The trigger itself (pins_set_defaults_on_insert) already exists from migration 02,
-- so we only need to replace the function body above.
