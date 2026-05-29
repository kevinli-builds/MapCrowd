-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 18 · Community-managed pin tags
-- Mods define a set of tags per community; pinners pick from the list.
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tag vocabulary per community (defined by mods/owner)
CREATE TABLE IF NOT EXISTS community_tags (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  -- Names are unique within a community (case-insensitive enforced in app)
  CONSTRAINT community_tags_unique_name UNIQUE (community_id, name)
);

CREATE INDEX IF NOT EXISTS community_tags_community_idx ON community_tags (community_id);

ALTER TABLE community_tags ENABLE ROW LEVEL SECURITY;

-- Anyone can read tags (needed to display them on pins for non-members too)
CREATE POLICY "community_tags_select_all" ON community_tags
  FOR SELECT USING (true);

-- Community owner or assigned mod can create tags
CREATE POLICY "community_tags_insert_mods" ON community_tags
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      EXISTS (SELECT 1 FROM communities    WHERE id = community_id AND created_by = auth.uid())
      OR EXISTS (SELECT 1 FROM community_moderators WHERE community_id = community_tags.community_id AND user_id = auth.uid())
    )
  );

-- Community owner or assigned mod can delete tags (cascades to pin_tags)
CREATE POLICY "community_tags_delete_mods" ON community_tags
  FOR DELETE USING (
    auth.uid() IS NOT NULL AND (
      EXISTS (SELECT 1 FROM communities    WHERE id = community_id AND created_by = auth.uid())
      OR EXISTS (SELECT 1 FROM community_moderators WHERE community_id = community_tags.community_id AND user_id = auth.uid())
    )
  );

-- 2. Pin → Tag associations (many-to-many)
CREATE TABLE IF NOT EXISTS pin_tags (
  pin_id UUID NOT NULL REFERENCES pins(id)            ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES community_tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (pin_id, tag_id)
);

CREATE INDEX IF NOT EXISTS pin_tags_tag_idx ON pin_tags (tag_id);

ALTER TABLE pin_tags ENABLE ROW LEVEL SECURITY;

-- Anyone can read pin tags
CREATE POLICY "pin_tags_select_all" ON pin_tags
  FOR SELECT USING (true);

-- Authenticated users can tag their own pins; mods can tag any pin in their community
CREATE POLICY "pin_tags_insert" ON pin_tags
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM pins p
      WHERE p.id = pin_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM communities c WHERE c.id = p.community_id AND c.created_by = auth.uid())
          OR EXISTS (SELECT 1 FROM community_moderators cm WHERE cm.community_id = p.community_id AND cm.user_id = auth.uid())
        )
    )
  );
