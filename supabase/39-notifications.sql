-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 39 · In-app notifications (§1 P1)
--
-- Gives users a reason to come back: a bell that fills when someone interacts
-- with their content. Rows are written ONLY by SECURITY DEFINER triggers (comment
-- on my pin, RSVP to my event, new follower, my pending pin approved/rejected) —
-- there is deliberately NO INSERT policy, so a client can never forge a
-- notification for someone else. Recipients read/mark-read/delete their own rows.
--
-- profiles.id == auth.users.id (profile is created on signup with the user's id),
-- so auth.uid() is a valid profiles reference and the FKs line up.
--
-- Web push is a later step; this is in-app only.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,  -- recipient
  type         TEXT        NOT NULL CHECK (type IN ('comment','rsvp','follow','pin_approved','pin_rejected')),
  actor_id     UUID                 REFERENCES profiles(id) ON DELETE SET NULL, -- who triggered it
  pin_id       UUID                 REFERENCES pins(id)     ON DELETE CASCADE,
  community_id UUID                 REFERENCES communities(id) ON DELETE CASCADE,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast "my unread, newest first" query.
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- FULL identity so Realtime can filter the stream on user_id (not just the PK).
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- Recipients only. No INSERT policy → only the SECURITY DEFINER triggers can write.
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
CREATE POLICY "notifications_delete_own" ON notifications FOR DELETE
  USING (auth.uid() = user_id);


-- ═══ Triggers — one per interaction, all SECURITY DEFINER + pinned search_path ══

-- 1. Someone commented on your pin.
CREATE OR REPLACE FUNCTION public.notify_pin_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author UUID; v_community UUID;
BEGIN
  SELECT user_id, community_id INTO v_author, v_community FROM pins WHERE id = NEW.pin_id;
  -- Skip anonymous-authored pins and self-comments.
  IF v_author IS NOT NULL AND v_author <> NEW.user_id THEN
    INSERT INTO notifications (user_id, type, actor_id, pin_id, community_id)
    VALUES (v_author, 'comment', NEW.user_id, NEW.pin_id, v_community);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS comments_notify ON comments;
CREATE TRIGGER comments_notify AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_pin_comment();

-- 2. Someone RSVP'd to your event.
CREATE OR REPLACE FUNCTION public.notify_event_rsvp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author UUID; v_community UUID;
BEGIN
  SELECT user_id, community_id INTO v_author, v_community FROM pins WHERE id = NEW.pin_id;
  IF v_author IS NOT NULL AND v_author <> NEW.user_id THEN
    INSERT INTO notifications (user_id, type, actor_id, pin_id, community_id)
    VALUES (v_author, 'rsvp', NEW.user_id, NEW.pin_id, v_community);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS event_rsvps_notify ON event_rsvps;
CREATE TRIGGER event_rsvps_notify AFTER INSERT ON event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.notify_event_rsvp();

-- 3. Someone started following you.
CREATE OR REPLACE FUNCTION public.notify_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, type, actor_id)
  VALUES (NEW.followee_id, 'follow', NEW.follower_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS follows_notify ON follows;
CREATE TRIGGER follows_notify AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_follow();

-- 4. A mod approved/rejected your pending pin. Fires only on the pending→resolved
--    transition; actor is the mod who acted (auth.uid()); skips anonymous pins.
CREATE OR REPLACE FUNCTION public.notify_pin_moderated()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved','rejected')
     AND NEW.user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, actor_id, pin_id, community_id)
    VALUES (
      NEW.user_id,
      CASE NEW.status WHEN 'approved' THEN 'pin_approved' ELSE 'pin_rejected' END,
      auth.uid(),
      NEW.id,
      NEW.community_id
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS pins_moderated_notify ON pins;
CREATE TRIGGER pins_moderated_notify AFTER UPDATE OF status ON pins
  FOR EACH ROW EXECUTE FUNCTION public.notify_pin_moderated();


-- ═══ Realtime — stream own notifications to the bell ═════════════════════════════
-- Add the table to the supabase_realtime publication (guarded so re-runs no-op).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
