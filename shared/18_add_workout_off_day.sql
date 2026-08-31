-- ==========================================================
-- OFF DAYS AND PERFORMED ORDER
-- ==========================================================
--
-- Targets are built from previous performance, so one bad session silently becomes
-- the next session's starting point. The causes are usually invisible in the data -
-- a machine was taken so the order changed and the press came round on pre-fatigued
-- muscles, illness, a rushed lunch break - and they all look identical from here:
-- a set that fell short.
--
-- Two records close that gap.

-- 1. The athlete's own judgement. The session stays in the log and in every volume
--    total; it is only skipped when choosing a progression baseline.
alter table public.kratos_workouts
  add column if not exists is_off_day boolean not null default false;

comment on column public.kratos_workouts.is_off_day is
  'Athlete marked this session as unrepresentative. Still counts for volume and history; skipped when choosing a progression baseline.';

-- 2. The order exercises were actually performed in, recorded per exercise inside
--    the existing `sets` jsonb rather than by reordering the array - other code
--    matches exercises by id and renders in array order, so changing that meaning
--    would break both. Null on every session logged before this existed; guessing
--    a value would be worse than admitting it is unknown.
comment on column public.kratos_workouts.sets is
  'Per-exercise logs. Each entry may carry performed_order: the 0-based position the exercise was actually done in, which can differ from the template order when equipment was busy.';
