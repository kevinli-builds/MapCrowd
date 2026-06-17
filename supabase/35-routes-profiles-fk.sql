-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 35 · Let routes embed their author profile
--
-- routes.user_id referenced auth.users, unlike pins/comments/follows which
-- reference profiles(id). Without a routes→profiles FK, PostgREST can't resolve
-- `profile:profiles(...)`, so every routes query that embeds the author 400s
-- (the community panel, the /c/[slug] routes list, the /?route= deep link).
--
-- Repoint the FK at profiles(id) (= auth.users.id, so integrity is unchanged;
-- every route's owner already has a profile). Mirrors pins.user_id.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_user_id_fkey;
ALTER TABLE routes
  ADD CONSTRAINT routes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
