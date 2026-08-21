-- Migration: Create tables for Zenith Stride & Health Connect Webhook Integration

-- 1. Table matching mcnaveen/health-connect-webhook payload schema (supports camelCase and raw JSON)
CREATE TABLE IF NOT EXISTS public.health_connect_logs (
    id TEXT PRIMARY KEY,
    timestamp BIGINT,
    "syncType" TEXT,
    synctype TEXT,
    "dataType" TEXT,
    datatype TEXT,
    "recordCount" INTEGER,
    recordcount INTEGER,
    "responseTimeMs" INTEGER,
    responsetimems INTEGER,
    "errorMessage" TEXT,
    errormessage TEXT,
    success BOOLEAN,
    url TEXT,
    payload JSONB,
    data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and grant anon/authenticated insert rights
ALTER TABLE public.health_connect_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert for all" ON public.health_connect_logs;
CREATE POLICY "Allow insert for all"
ON public.health_connect_logs FOR INSERT
TO authenticated, anon
WITH CHECK (true);

-- No client-side SELECT policy: this table is a write-only ingestion log for the
-- unauthenticated Health Connect webhook bridge (it has no Supabase session to
-- scope reads to). Nothing in the app reads it back client-side; it's insert-only.
DROP POLICY IF EXISTS "Allow select for all" ON public.health_connect_logs;

-- RPC Function for raw JSON ingestion
CREATE OR REPLACE FUNCTION public.health_connect_ingest(payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.health_connect_logs (id, payload)
    VALUES (COALESCE((payload->>'id'), gen_random_uuid()::text), payload);
    RETURN jsonb_build_object('success', true, 'status', 'received');
END;
$$;

GRANT EXECUTE ON FUNCTION public.health_connect_ingest TO anon, authenticated;

-- 2. Table for Zenith Stride running activities
CREATE TABLE IF NOT EXISTS public.stride_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    date DATE NOT NULL,
    time_of_day TEXT,
    type TEXT NOT NULL DEFAULT 'easy',
    is_treadmill BOOLEAN DEFAULT FALSE,
    incline_percent NUMERIC(4,2) DEFAULT 0,
    distance_km NUMERIC(6,2) NOT NULL,
    duration_sec INTEGER NOT NULL,
    avg_pace_min_km NUMERIC(5,2) NOT NULL,
    elevation_gain_m INTEGER DEFAULT 0,
    avg_heart_rate INTEGER,
    max_heart_rate INTEGER,
    avg_cadence_spm INTEGER,
    calories INTEGER,
    rpe INTEGER,
    shoe_id TEXT,
    shoe_name TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    notes TEXT,
    route_coordinates JSONB,
    splits JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.stride_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert and select for authenticated users on stride_activities" ON public.stride_activities;
DROP POLICY IF EXISTS "Users can manage their own stride activities" ON public.stride_activities;
CREATE POLICY "Users can manage their own stride activities"
ON public.stride_activities FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
