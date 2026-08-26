-- Most user_id indexes already exist live (idx_rides_user_id,
-- idx_kratos_workouts_user_id, idx_vigor_*_user_id) plus the
-- (user_id, local_date) unique indexes on vigor_sleep/vigor_steps added by
-- 08_add_local_date_key.sql. The remaining gaps: planned_workouts has no
-- user_id index at all, and rides/kratos_workouts/vigor_weight only have a
-- user_id-only index rather than a composite covering the (user_id,
-- date-range) shape every PMC/ACWR/training-load query actually filters on
-- (shared/services/trainingLoad.ts, shared/pmc.ts callers).

create index if not exists idx_planned_workouts_user_id on public.planned_workouts (user_id);
create index if not exists idx_rides_user_id_date on public.rides (user_id, date);
create index if not exists idx_kratos_workouts_user_id_completed_at on public.kratos_workouts (user_id, completed_at);
create index if not exists idx_vigor_weight_user_id_local_date on public.vigor_weight (user_id, local_date);
