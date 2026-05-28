-- Migration 15: Community groups (folders) for organising subscriptions.
-- Run in Supabase SQL Editor after migrations 00-14.

-- Table: user-defined folder/group names
CREATE TABLE IF NOT EXISTS community_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 50),
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE community_groups ENABLE ROW LEVEL SECURITY;

-- Users own their own groups
CREATE POLICY community_groups_owner ON community_groups
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add group_id to subscriptions (nullable — NULL means ungrouped)
ALTER TABLE community_subscriptions
  ADD COLUMN IF NOT EXISTS group_id UUID
    REFERENCES community_groups(id) ON DELETE SET NULL;
