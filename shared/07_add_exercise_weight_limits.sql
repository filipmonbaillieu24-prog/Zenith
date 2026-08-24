-- Per-exercise hard weight limits, so autoregulation suggestions can never
-- exceed a machine's real stack range in either direction. Both nullable:
-- "no limit" is the default for every existing exercise, matching how
-- increment_weight already works today.

alter table public.kratos_exercises
  add column if not exists min_weight numeric,
  add column if not exists max_weight numeric;

alter table public.kratos_exercises
  add constraint kratos_exercises_weight_limits_check
  check (min_weight is null or max_weight is null or min_weight <= max_weight);
