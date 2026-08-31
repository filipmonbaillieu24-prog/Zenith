-- Weekly training-load targets.
--
-- The calendar could say how faithfully a week was followed but not whether the week
-- was the right size in the first place. A target is stored per week rather than as
-- one number on the profile, because the point of a target is that it changes: build
-- weeks climb, a recovery week drops, and a single figure could express neither.

create table if not exists public.weekly_load_targets (
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Monday of the week, as a local calendar day. Text for the same reason
  -- planned_workouts.date is text: these are calendar days, not instants, and a
  -- timestamp would drag them across a timezone boundary.
  week_start  text not null,
  target_load integer not null check (target_load > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.weekly_load_targets enable row level security;

drop policy if exists "own weekly load targets" on public.weekly_load_targets;
create policy "own weekly load targets" on public.weekly_load_targets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
