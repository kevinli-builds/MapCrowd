-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 19 · pin_tags DELETE policy
-- Allows pin authors and community mods/owners to remove tags from existing pins.
-- Run after 18-community-tags.sql.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "pin_tags_delete" ON pin_tags
  FOR DELETE USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM pins p
      WHERE p.id = pin_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM communities c    WHERE c.id = p.community_id AND c.created_by = auth.uid())
          OR EXISTS (SELECT 1 FROM community_moderators cm WHERE cm.community_id = p.community_id AND cm.user_id = auth.uid())
        )
    )
  );
