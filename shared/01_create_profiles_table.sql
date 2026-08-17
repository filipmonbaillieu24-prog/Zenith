-- ==========================================================
-- ZENITH UNIFIED PROFILES & ML WEIGHTS MIGRATION
-- ==========================================================

-- 1. Create Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  birth_date DATE,
  gender TEXT,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  ftp_watts INTEGER DEFAULT 220,
  lthr_bpm INTEGER DEFAULT 165,
  training_goal TEXT DEFAULT 'general',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow individual read" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Allow individual write" ON public.profiles
  FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);


-- 2. Create ML Weights Table
CREATE TABLE IF NOT EXISTS public.ml_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  model_name TEXT NOT NULL,
  weights JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_user_model UNIQUE (user_id, model_name)
);

-- Enable RLS for ml_weights
ALTER TABLE public.ml_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow individual weights management" ON public.ml_weights
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- 3. Trigger function to sync weight from vigor_weight
CREATE OR REPLACE FUNCTION public.sync_vigor_weight_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, weight_kg, updated_at)
  VALUES (NEW.user_id, NEW.weight, now())
  ON CONFLICT (id) DO UPDATE
  SET weight_kg = EXCLUDED.weight_kg,
      updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on vigor_weight
DROP TRIGGER IF EXISTS trg_sync_vigor_weight ON public.vigor_weight;
CREATE TRIGGER trg_sync_vigor_weight
  AFTER INSERT OR UPDATE ON public.vigor_weight
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_vigor_weight_to_profile();


-- 4. Trigger function to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Athlete'),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users (runs as system/postgres)
DROP TRIGGER IF EXISTS trg_create_profile ON auth.users;
-- Note: triggers on auth.users need superuser or specific events; normally handled via public table trigger
-- In Supabase we create it on auth.users
CREATE TRIGGER trg_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_profile_for_new_user();
