-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 21 · User follows
-- Lets a user follow another user to track their pin activity.
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

-- follows: one row = "follower follows followee"
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT follows_no_self CHECK (follower_id <> followee_id)
);

-- Fast lookup of "who does X follow" and "who follows X"
CREATE INDEX IF NOT EXISTS follows_follower_idx ON follows (follower_id);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows (followee_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- The social graph is public: anyone can read follower / following relationships
-- (needed for public follower counts on profile pages).
DROP POLICY IF EXISTS "follows_select_all" ON follows;
CREATE POLICY "follows_select_all" ON follows
  FOR SELECT USING (true);

-- You can only create / remove your OWN follow rows.
DROP POLICY IF EXISTS "follows_insert_own" ON follows;
CREATE POLICY "follows_insert_own" ON follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "follows_delete_own" ON follows;
CREATE POLICY "follows_delete_own" ON follows
  FOR DELETE USING (auth.uid() = follower_id);
