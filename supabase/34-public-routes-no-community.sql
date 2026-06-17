-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 34 · Allow "publish publicly" (public route, no community)
--
-- Originally a public route had to name a community. Now there are two kinds of
-- published route:
--   • community route  — is_public=true, community_id set (all stops in that
--                        community); shown on the community page + panel.
--   • public route     — is_public=true, community_id NULL; viewable by anyone
--                        with the link (for routes spanning communities).
-- So drop the "public implies community" CHECK.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_public_has_community;
