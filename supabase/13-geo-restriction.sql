-- Migration 13: Geographic area restriction for communities
-- Run in Supabase SQL Editor.
-- Adds an optional geo_restriction column to communities.
-- Shape: { "name": "New York City", "south": 40.477, "north": 40.917, "west": -74.259, "east": -73.700 }
-- null means no restriction (pins can be placed anywhere).

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS geo_restriction JSONB DEFAULT NULL;
