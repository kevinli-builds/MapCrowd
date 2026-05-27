-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd Migration 06 — Private Communities & Member Invites
--
-- Run after 05-search-profiles-migration.sql.
-- Safe to re-run (IF NOT EXISTS / DO NOTHING throughout).
--
-- What this does:
--   1. Adds is_private to communities
--   2. Creates community_members table (pending + accepted memberships)
--   3. Replaces the "show everything" SELECT policies on communities & pins
--      with privacy-aware ones
--   4. Trigger: auto-adds the creator as an accepted member of any private
--      community the moment it is created
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. is_private column ─────────────────────────────────────────────────────

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;


-- ── 2. community_members table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID        NOT NULL REFERENCES communities(id)  ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  invited_by   UUID                 REFERENCES auth.users(id)   ON DELETE SET NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'accepted')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

-- Invited users see their own rows (needed to render the invite banner)
CREATE POLICY "members_select_own"
  ON community_members FOR SELECT
  USING (auth.uid() = user_id);

-- Community owners see all members of their communities (for the Members tab)
CREATE POLICY "members_select_owner"
  ON community_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM communities
    WHERE id = community_id AND created_by = auth.uid()
  ));

-- Only owners can invite (INSERT)
CREATE POLICY "members_insert_owner"
  ON community_members FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM communities
    WHERE id = community_id AND created_by = auth.uid()
  ));

-- Users can accept their own pending invite (status → accepted)
CREATE POLICY "members_update_accept"
  ON community_members FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'accepted');

-- Owners can remove anyone from the community
CREATE POLICY "members_delete_owner"
  ON community_members FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM communities
    WHERE id = community_id AND created_by = auth.uid()
  ));

-- Users can remove themselves (leave community or decline invite)
CREATE POLICY "members_delete_self"
  ON community_members FOR DELETE
  USING (auth.uid() = user_id);


-- ── 3a. communities SELECT — replace with privacy-aware policy ────────────────

DROP POLICY IF EXISTS "communities_select_all" ON communities;

-- Public communities are always visible.
-- Private: visible to creator, or to anyone with a community_members row
-- (either pending or accepted), so the invited user can see the name/icon
-- before they decide to accept.
CREATE POLICY "communities_select_public_or_member"
  ON communities FOR SELECT
  USING (
    is_private = false
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM community_members
      WHERE community_id = communities.id
        AND user_id = auth.uid()
    )
  );


-- ── 3b. pins SELECT — hide pins in private communities from non-members ───────

DROP POLICY IF EXISTS "pins_select_all" ON pins;

-- A pin is visible when its community is public, or the viewer is the
-- community owner, or they are an *accepted* member.
-- (Pending invite holders cannot see pins yet — accept first.)
CREATE POLICY "pins_select_public_or_member"
  ON pins FOR SELECT
  USING (
    -- community is public
    NOT EXISTS (
      SELECT 1 FROM communities
      WHERE id = pins.community_id AND is_private = true
    )
    -- OR viewer is the community creator
    OR EXISTS (
      SELECT 1 FROM communities
      WHERE id = pins.community_id AND created_by = auth.uid()
    )
    -- OR viewer is an accepted member
    OR EXISTS (
      SELECT 1 FROM community_members
      WHERE community_id = pins.community_id
        AND user_id      = auth.uid()
        AND status       = 'accepted'
    )
  );


-- ── 4. Trigger: auto-add creator as accepted member ──────────────────────────

CREATE OR REPLACE FUNCTION public.add_creator_to_private_community()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_private AND NEW.created_by IS NOT NULL THEN
    INSERT INTO community_members (community_id, user_id, invited_by, status)
    VALUES (NEW.id, NEW.created_by, NEW.created_by, 'accepted')
    ON CONFLICT (community_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_private_community_created ON communities;
CREATE TRIGGER on_private_community_created
  AFTER INSERT ON communities
  FOR EACH ROW EXECUTE FUNCTION public.add_creator_to_private_community();
