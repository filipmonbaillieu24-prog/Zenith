-- ==========================================================
-- READINESS: THE ONE THING THE RECOVERY MODEL NEVER HAD
-- ==========================================================
--
-- The recovery model's training target is recoveryHeuristic - a formula computed
-- from the model's own inputs. A network fitted to a formula over its own inputs
-- cannot beat that formula. It can only approximate it less exactly, while adding
-- drift, storage and the appearance of having learned something.
--
-- One honest observation a day is what changes that. The heuristic remains the
-- target for days with no answer, so it still governs early on; as answers
-- accumulate they become the majority of the training set on their own and the
-- model starts describing where THIS athlete departs from the average.

create table if not exists public.vigor_readiness (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  -- 1 wrecked, 2 flat, 3 ok, 4 good, 5 flying. Five options because people cannot
  -- honestly tell 63 from 68 about themselves, and a scale that pretends they can
  -- collects noise dressed as precision.
  felt smallint not null check (felt between 1 and 5),
  -- What the model predicted at the moment they answered. Stored because the
  -- residual cannot be reconstructed later: the inputs move through the day, so a
  -- recomputation would not be the number they were reacting to.
  predicted_score smallint check (predicted_score between 0 and 100),
  note text,
  created_at timestamptz default now(),
  unique (user_id, local_date)
);

alter table public.vigor_readiness enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'vigor_readiness' and policyname = 'own readiness') then
    create policy "own readiness" on public.vigor_readiness
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists vigor_readiness_user_date_idx
  on public.vigor_readiness (user_id, local_date desc);
