-- ==========================================================
-- ZENITH MIGRATION: Add unit_system and weight_unit to Profiles
-- ==========================================================

ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS unit_system TEXT DEFAULT 'metric',
  ADD COLUMN IF NOT EXISTS weight_unit TEXT DEFAULT 'kg';
