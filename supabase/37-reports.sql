-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 37 · Abuse reports (trust & safety)
-- Lets anyone (incl. anonymous) flag a pin / comment / photo. Reports are visible
-- only to mods of the target's community (or site admins), who resolve or delete
-- them from the moderation queue.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reports (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: anonymous users can report. Kept for de-dup / repeat-offender signal.
  reporter_id  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  target_type  TEXT        NOT NULL CHECK (target_type IN ('pin', 'comment', 'photo')),
  target_id    UUID        NOT NULL,
  -- Denormalised at insert time by a trigger so mods can query + RLS can gate by community.
  community_id UUID        REFERENCES communities(id) ON DELETE CASCADE,
  reason       TEXT        NOT NULL CHECK (reason IN ('spam', 'inappropriate', 'wrong_location', 'other')),
  detail       TEXT        CHECK (detail IS NULL OR char_length(detail) <= 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS reports_open_idx ON reports (community_id, created_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS reports_target_idx ON reports (target_type, target_id);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- ── Resolve the target's community + reject junk on insert ────────────────────
-- SECURITY DEFINER so it can read pins/comments/pin_photos regardless of the
-- reporter's RLS. Also forces resolved_* to NULL so a reporter can't pre-resolve.
CREATE OR REPLACE FUNCTION public.set_report_community()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.community_id := CASE NEW.target_type
    WHEN 'pin'     THEN (SELECT community_id FROM pins WHERE id = NEW.target_id)
    WHEN 'comment' THEN (SELECT p.community_id FROM comments c JOIN pins p ON p.id = c.pin_id WHERE c.id = NEW.target_id)
    WHEN 'photo'   THEN (SELECT p.community_id FROM pin_photos ph JOIN pins p ON p.id = ph.pin_id WHERE ph.id = NEW.target_id)
  END;
  IF NEW.community_id IS NULL THEN
    RAISE EXCEPTION 'report target not found';
  END IF;
  NEW.resolved_at := NULL;
  NEW.resolved_by := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_report_community ON reports;
CREATE TRIGGER trg_set_report_community
  BEFORE INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION public.set_report_community();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Anyone (incl. anonymous) may file a report; can't spoof another user's id.
DROP POLICY IF EXISTS "reports_insert_anyone" ON reports;
CREATE POLICY "reports_insert_anyone" ON reports FOR INSERT
  WITH CHECK (reporter_id IS NULL OR reporter_id = auth.uid());

-- Only mods of the target community (or site admins) can read reports.
DROP POLICY IF EXISTS "reports_select_mod" ON reports;
CREATE POLICY "reports_select_mod" ON reports FOR SELECT
  USING (public.is_site_admin() OR public.is_community_mod(community_id));

-- Mods resolve (UPDATE) reports in their community.
DROP POLICY IF EXISTS "reports_update_mod" ON reports;
CREATE POLICY "reports_update_mod" ON reports FOR UPDATE
  USING      (public.is_site_admin() OR public.is_community_mod(community_id))
  WITH CHECK (public.is_site_admin() OR public.is_community_mod(community_id));

-- Mods delete reports in their community.
DROP POLICY IF EXISTS "reports_delete_mod" ON reports;
CREATE POLICY "reports_delete_mod" ON reports FOR DELETE
  USING (public.is_site_admin() OR public.is_community_mod(community_id));
