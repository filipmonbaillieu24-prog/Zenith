-- ==========================================================
-- PLANNING FOR ALL THREE DISCIPLINES
-- ==========================================================
--
-- planned_workouts was built for cycling: `type` holds cycling zones, and everything
-- hangs off planned_tss, ftp and lthr. Strength and running had no way in, so a
-- planned gym session or run was invisible to the calendar - and to Fuel, which now
-- reads these to work out what a training day costs. Before this, a three-hour ride
-- day got the same calorie and macro targets as a rest day right up until the ride
-- had already happened.

alter table public.planned_workouts
  add column if not exists discipline text not null default 'aero',
  -- Which Kratos routine is planned. Text rather than a foreign key: planned_workouts.id
  -- is already text, and a template may be deleted while a plan referencing it still
  -- exists - a dangling reference should not block that delete.
  add column if not exists template_id text,
  -- For a planned run.
  add column if not exists distance_km numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planned_workouts_discipline_valid') then
    alter table public.planned_workouts
      add constraint planned_workouts_discipline_valid
      check (discipline in ('aero', 'kratos', 'stride'));
  end if;
end $$;

comment on column public.planned_workouts.discipline is
  'Which app the session belongs to: aero (cycling), kratos (strength), stride (running). Defaults to aero, which is what every row predating this column is.';

comment on column public.planned_workouts.planned_tss is
  'Cycling training-stress estimate. Only meaningful for discipline = aero; strength and running plans carry 0 and are costed from duration and distance instead.';

create index if not exists planned_workouts_user_date_idx
  on public.planned_workouts (user_id, date);
