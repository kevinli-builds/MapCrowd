-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 29 · Editable pin address
--
-- Pins show a reverse-geocoded address (Nominatim, derived live from lat/lng).
-- That's often approximate — quick-add drops you at your GPS point and the
-- geocoder picks the nearest building, which may be wrong or vague. This adds an
-- optional, user-supplied `address` that OVERRIDES the auto-geocoded text when
-- present, so an author can make it specific ("Stall 4, Chelsea Market").
--
-- 1. pins.address — optional free text (<=200 chars, no angle brackets so it's
--    safe anywhere it might be interpolated; mirrors the communities.icon CHECK).
-- 2. update_pin() gains p_address — still column-restricted to author/mod-safe
--    fields (title / description / url / address); never status, votes, etc.
--    The old 4-arg signature is dropped so there's no overload ambiguity.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE pins
  ADD COLUMN IF NOT EXISTS address TEXT
  CHECK (address IS NULL OR (char_length(address) <= 200 AND address !~ '[<>]'));

-- Replace the 4-arg editor with a 5-arg one (drop first to avoid an overload).
DROP FUNCTION IF EXISTS public.update_pin(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.update_pin(
  p_pin_id      UUID,
  p_title       TEXT,
  p_description TEXT,
  p_url         TEXT,
  p_address     TEXT
)
RETURNS public.pins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result_pin public.pins;
BEGIN
  IF NOT public.is_pin_owner_or_mod(p_pin_id) THEN
    RAISE EXCEPTION 'Not authorized to edit this pin';
  END IF;

  IF char_length(trim(p_title)) < 1 OR char_length(trim(p_title)) > 100 THEN
    RAISE EXCEPTION 'Title must be between 1 and 100 characters';
  END IF;

  IF p_url IS NOT NULL AND trim(p_url) <> '' AND trim(p_url) !~* '^https?://' THEN
    RAISE EXCEPTION 'Links must start with http:// or https://';
  END IF;

  IF p_address IS NOT NULL AND char_length(trim(p_address)) > 200 THEN
    RAISE EXCEPTION 'Address must be 200 characters or fewer';
  END IF;

  UPDATE pins SET
    title       = trim(p_title),
    description = NULLIF(trim(COALESCE(p_description, '')), ''),
    url         = NULLIF(trim(COALESCE(p_url, '')), ''),
    address     = NULLIF(trim(COALESCE(p_address, '')), '')
  WHERE id = p_pin_id
  RETURNING * INTO result_pin;

  RETURN result_pin;
END; $$;

GRANT EXECUTE ON FUNCTION public.update_pin TO authenticated;
