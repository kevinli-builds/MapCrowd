-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 24 · Pin external links + editing
--
-- 1. pins.url — optional external link (http/https only, CHECK-constrained).
-- 2. update_pin() — SECURITY DEFINER editor that lets the pin author OR a
--    community mod/admin change ONLY title / description / url. Keeping this in
--    an RPC (rather than a broad UPDATE policy) means authors can't tamper with
--    protected columns like status, vote_count, community_id, or event fields.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE pins
  ADD COLUMN IF NOT EXISTS url TEXT
  CHECK (url IS NULL OR (char_length(url) <= 500 AND url ~* '^https?://'));

CREATE OR REPLACE FUNCTION public.update_pin(
  p_pin_id      UUID,
  p_title       TEXT,
  p_description TEXT,
  p_url         TEXT
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

  UPDATE pins SET
    title       = trim(p_title),
    description = NULLIF(trim(COALESCE(p_description, '')), ''),
    url         = NULLIF(trim(COALESCE(p_url, '')), '')
  WHERE id = p_pin_id
  RETURNING * INTO result_pin;

  RETURN result_pin;
END; $$;

GRANT EXECUTE ON FUNCTION public.update_pin TO authenticated;
