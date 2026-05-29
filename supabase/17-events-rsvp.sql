-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 17 · Events / Meetup RSVPs
-- Adds optional event metadata to pins and a table for "Going" RSVPs.
-- Safe to re-run: all statements use IF NOT EXISTS / CREATE OR REPLACE.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add event columns to pins (all nullable; NULL = regular pin, not an event)
ALTER TABLE pins
  ADD COLUMN IF NOT EXISTS event_date      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_end_date  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_capacity  INTEGER;

-- 2. RSVPs table: one row per (pin, user) means "I'm going"
CREATE TABLE IF NOT EXISTS event_rsvps (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pin_id     UUID NOT NULL REFERENCES pins(id)       ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT event_rsvps_unique_user UNIQUE (pin_id, user_id)
);

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

-- Public RSVP count (anyone can see how many people are going)
CREATE POLICY "rsvps_select_all" ON event_rsvps
  FOR SELECT USING (true);

-- Authenticated users insert their own RSVP
CREATE POLICY "rsvps_insert_own" ON event_rsvps
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users remove their own RSVP
CREATE POLICY "rsvps_delete_own" ON event_rsvps
  FOR DELETE USING (auth.uid() = user_id);

-- 3. RPC: toggle RSVP atomically; enforces capacity limit
--    Returns JSON: { going: bool, rsvp_count: int }
CREATE OR REPLACE FUNCTION toggle_event_rsvp(p_pin_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user_id  UUID    := auth.uid();
  v_exists   BOOLEAN;
  v_count    INTEGER;
  v_going    BOOLEAN;
  v_capacity INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Grab capacity limit (NULL = unlimited)
  SELECT event_capacity INTO v_capacity FROM pins WHERE id = p_pin_id;

  -- Is the user already going?
  SELECT EXISTS (
    SELECT 1 FROM event_rsvps WHERE pin_id = p_pin_id AND user_id = v_user_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Un-RSVP
    DELETE FROM event_rsvps WHERE pin_id = p_pin_id AND user_id = v_user_id;
    v_going := FALSE;
  ELSE
    -- Check capacity before inserting
    IF v_capacity IS NOT NULL THEN
      SELECT COUNT(*) INTO v_count FROM event_rsvps WHERE pin_id = p_pin_id;
      IF v_count >= v_capacity THEN
        RAISE EXCEPTION 'Event is full';
      END IF;
    END IF;
    INSERT INTO event_rsvps (pin_id, user_id) VALUES (p_pin_id, v_user_id);
    v_going := TRUE;
  END IF;

  SELECT COUNT(*) INTO v_count FROM event_rsvps WHERE pin_id = p_pin_id;

  RETURN json_build_object('going', v_going, 'rsvp_count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
