-- ==========================================================
-- MUSCLE SORENESS
-- ==========================================================
--
-- Readiness (16_) asks how the whole athlete feels. Soreness is local, and for
-- someone who lifts it is the signal that actually decides whether today's session
-- should go heavy - weekly tonnage cannot tell a fresh chest from one still wrecked
-- from Monday.
--
-- One row per DAY rather than one per muscle, so "I checked in and nothing was
-- sore" is representable as an empty object. With a row per sore muscle, a day with
-- no soreness would be indistinguishable from a day nobody answered.

create table if not exists public.vigor_soreness (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  -- { "chest": 2, "triceps": 1 } - muscle slug to severity, 1 mild / 2 moderate /
  -- 3 severe. Absent means not sore. Slugs match MuscleMapPaths so this can drive
  -- the anatomical heatmap without a translation layer.
  groups jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (user_id, local_date)
);

alter table public.vigor_soreness enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'vigor_soreness' and policyname = 'own soreness') then
    create policy "own soreness" on public.vigor_soreness
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists vigor_soreness_user_date_idx
  on public.vigor_soreness (user_id, local_date desc);
