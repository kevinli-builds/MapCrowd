-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 16 · Anonymous pin drops
-- Allows unauthenticated users to drop pins in communities where
-- who_can_pin = 'anyone', without requiring an account.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Make pins.user_id nullable so anonymous pins (user_id = NULL) are valid.
--    Safe to re-run: PostgreSQL is a no-op if the column is already nullable.
ALTER TABLE pins ALTER COLUMN user_id DROP NOT NULL;

-- 2. Update can_user_pin_in_community() to handle unauthenticated callers.
--    'anyone' communities are always open; all others require auth.uid().
CREATE OR REPLACE FUNCTION can_user_pin_in_community(p_community_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_who TEXT;
BEGIN
  SELECT who_can_pin INTO v_who FROM communities WHERE id = p_community_id;

  -- 'anyone' communities are always open — no auth required
  IF v_who = 'anyone' THEN RETURN TRUE; END IF;

  -- All other permission levels require the caller to be authenticated
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;

  IF v_who = 'subscribers' THEN
    RETURN EXISTS (
      SELECT 1 FROM community_subscriptions
      WHERE community_id = p_community_id AND user_id = auth.uid()
    );
  END IF;

  -- 'mods': community owner or an assigned moderator
  RETURN
    EXISTS (SELECT 1 FROM communities       WHERE id = p_community_id AND created_by = auth.uid())
    OR
    EXISTS (SELECT 1 FROM community_moderators WHERE community_id = p_community_id AND user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Replace the INSERT policy to allow anonymous pins in open communities.
DROP POLICY IF EXISTS "pins_insert_with_permission" ON pins;

CREATE POLICY "pins_insert_with_permission" ON pins
  FOR INSERT WITH CHECK (
    CASE
      WHEN auth.uid() IS NOT NULL THEN
        -- Authenticated path: pin must belong to the caller and they must have permission
        auth.uid() = user_id
        AND can_user_pin_in_community(community_id)
      ELSE
        -- Anonymous path: only in 'anyone' communities; user_id must be NULL
        user_id IS NULL
        AND (SELECT who_can_pin FROM communities WHERE id = community_id) = 'anyone'
    END
  );
