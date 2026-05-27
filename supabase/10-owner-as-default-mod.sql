-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd Migration 10 — Backfill community owners as moderators
--
-- Every community creator should automatically appear in their own Mods list.
-- New communities are handled client-side (CreateCommunityModal inserts the
-- row after creation).  This migration backfills all existing communities so
-- no owner is silently missing from their own mod roster.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO community_moderators (community_id, user_id, assigned_by)
SELECT id, created_by, created_by
FROM communities
WHERE created_by IS NOT NULL
ON CONFLICT (community_id, user_id) DO NOTHING;
