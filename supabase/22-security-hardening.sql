-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 22 · Security hardening
--
-- 1. Defense-in-depth CHECK constraints on communities.color / icon.
--    The map renders these as raw HTML (Leaflet divIcon), and RLS only checks
--    ownership — not value shape. The client now escapes them at render time
--    (the actual fix), and these constraints stop bad values being stored at all.
--
-- 2. Pin search_path on SECURITY DEFINER functions that were missing it.
--    A SECURITY DEFINER function with a mutable search_path can be tricked into
--    resolving unqualified names against an attacker-controlled schema. Pinning
--    it to `public` closes that class of issue (and clears the Supabase linter
--    "Function Search Path Mutable" warning).
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Value-shape constraints (NOT VALID: enforced on new writes, existing rows
--    left alone so the migration can't fail on legacy data; render-side escaping
--    covers anything already stored).

ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_color_hex;
ALTER TABLE communities
  ADD CONSTRAINT communities_color_hex
  CHECK (color ~ '^#[0-9a-fA-F]{3,8}$') NOT VALID;

ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_icon_safe;
ALTER TABLE communities
  ADD CONSTRAINT communities_icon_safe
  CHECK (char_length(icon) <= 32 AND icon !~ '[<>]') NOT VALID;

-- 2. Pin search_path on the SECURITY DEFINER functions still missing it.
--    ALTER FUNCTION sets the config without redefining the body.

ALTER FUNCTION public.can_user_pin_in_community(uuid) SET search_path = public;
ALTER FUNCTION public.set_pin_defaults_on_insert()    SET search_path = public;
ALTER FUNCTION public.get_community_stats(uuid)       SET search_path = public;
ALTER FUNCTION public.toggle_event_rsvp(uuid)         SET search_path = public;
