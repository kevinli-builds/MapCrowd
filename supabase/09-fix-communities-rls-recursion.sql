-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd Migration 09 — Fix infinite recursion in communities RLS
--
-- Problem:
--   The communities_select_public_or_member policy (added in migration 06)
--   included a direct EXISTS subquery on community_members.  That table has
--   its own RLS policy (members_select_owner) which queries back into
--   communities, creating an infinite recursion:
--
--     SELECT communities → communities policy → SELECT community_members
--       → community_members policy → SELECT communities → … ∞
--
-- Fix:
--   Wrap the community_members lookup in a SECURITY DEFINER function so it
--   bypasses RLS on community_members, breaking the cycle.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: check membership without triggering community_members RLS
CREATE OR REPLACE FUNCTION public.check_community_member(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = p_community_id
      AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_community_member TO anon, authenticated;

-- Rebuild the SELECT policy using the function instead of a direct subquery
DROP POLICY IF EXISTS "communities_select_public_or_member" ON communities;
CREATE POLICY "communities_select_public_or_member"
  ON communities FOR SELECT
  USING (
    is_private = false
    OR created_by = auth.uid()
    OR public.check_community_member(id)
  );
