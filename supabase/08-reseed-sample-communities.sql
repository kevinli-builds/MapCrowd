-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — Reseed sample communities
--
-- Safe to run at any time. ON CONFLICT DO NOTHING means rows that already
-- exist (matched by slug) are left untouched.
--
-- Run this in Supabase SQL Editor if the starter communities are missing.
-- ─────────────────────────────────────────────────────────────────────────────

-- Note: is_private is intentionally omitted so this works whether or not
-- migration 06 has been run. If the column exists it defaults to false.

INSERT INTO communities (name, slug, description, color, icon)
VALUES
  ('Birds',            'birds',       'Bird sightings from fellow birders',              '#22c55e', '🐦'),
  ('Public Bathrooms', 'bathrooms',   'Clean and accessible public restrooms',           '#3b82f6', '🚻'),
  ('Vegan Spots',      'vegan',       'Vegan-friendly restaurants and cafes',            '#a855f7', '🌱'),
  ('Street Art',       'street-art',  'Murals, graffiti, and public art installations',  '#f97316', '🎨'),
  ('Free WiFi',        'wifi',        'Free public WiFi hotspots',                       '#eab308', '📶'),
  ('Hiking Trails',    'hiking',      'Trail heads, scenic spots, and campgrounds',      '#78716c', '🥾')
ON CONFLICT (slug) DO NOTHING;
