-- Fixes duplicate vigor_sleep/vigor_steps rows for the same real-world day.
--
-- Root causes (both confirmed against live data this session):
-- 1. Timezone mismatch: the trigger's "today" upsert matched on logged_at::date (a
--    Postgres date cast resolved in the DB session's timezone, UTC), while Vigor's
--    dashboard groups the same rows by the browser's LOCAL timezone. A sync landing
--    near the UTC day boundary could be bucketed differently by each side.
-- 2. Race condition: the historical daily_steps/daily_sleep loop used a non-atomic
--    "check if a row exists, then insert or update" pattern. Two overlapping syncs
--    could both see "no row yet" and both insert, producing byte-for-byte duplicate
--    rows (this is exactly what two existing duplicate pairs in the live data show).
--
-- Fix: one explicit `local_date` column, set once by the actual writer (Pulse sends
-- its device-local calendar date in the payload; the historical loops already receive
-- one per entry), used everywhere instead of deriving a date from logged_at. Sleep and
-- steps also get a real uniqueness constraint plus atomic ON CONFLICT upserts, making
-- this class of duplicate structurally impossible rather than just less likely.
--
-- vigor_weight gets the same local_date-based matching in the trigger but NOT a
-- uniqueness constraint: unlike sleep/steps, multiple weigh-ins per real day are a
-- legitimate, intentional use case (manual re-weighing), not a bug.

alter table public.vigor_sleep add column if not exists local_date date;
alter table public.vigor_steps add column if not exists local_date date;
alter table public.vigor_weight add column if not exists local_date date;

update public.vigor_sleep set local_date = logged_at::date where local_date is null;
update public.vigor_steps set local_date = logged_at::date where local_date is null;
update public.vigor_weight set local_date = logged_at::date where local_date is null;

-- One-time merge of existing duplicate (user_id, local_date) groups: keep the
-- lowest id per group, fill it in with the max() (i.e. any available non-null) value
-- from every row in the group, then delete the rest. Verified against the live
-- duplicate pairs before writing this: both known pairs are already byte-for-byte
-- identical, so this reduces to "keep one, drop the other" for today's data, but the
-- merge is written generically in case any future duplicate isn't a clean match.
with merged_sleep as (
  select
    user_id,
    local_date,
    min(id::text)::uuid as keep_id,
    max(duration_minutes) as duration_minutes,
    max(deep_minutes) as deep_minutes,
    max(light_minutes) as light_minutes,
    max(rem_minutes) as rem_minutes,
    max(quality_score) as quality_score,
    max(logged_at) as logged_at,
    max(awake_minutes) as awake_minutes,
    max(hrv_ms) as hrv_ms,
    max(resting_hr) as resting_hr,
    max(spo2_percent) as spo2_percent,
    max(respiratory_rate) as respiratory_rate
  from public.vigor_sleep
  where local_date is not null
  group by user_id, local_date
  having count(*) > 1
)
update public.vigor_sleep s
set duration_minutes = m.duration_minutes,
    deep_minutes = m.deep_minutes,
    light_minutes = m.light_minutes,
    rem_minutes = m.rem_minutes,
    quality_score = m.quality_score,
    logged_at = m.logged_at,
    awake_minutes = m.awake_minutes,
    hrv_ms = m.hrv_ms,
    resting_hr = m.resting_hr,
    spo2_percent = m.spo2_percent,
    respiratory_rate = m.respiratory_rate
from merged_sleep m
where s.id = m.keep_id;

delete from public.vigor_sleep
where id in (
  select id from (
    select id, row_number() over (partition by user_id, local_date order by id) as rn
    from public.vigor_sleep
    where local_date is not null
  ) t
  where t.rn > 1
);

with merged_steps as (
  select user_id, local_date, min(id::text)::uuid as keep_id, max(step_count) as step_count, max(logged_at) as logged_at
  from public.vigor_steps
  where local_date is not null
  group by user_id, local_date
  having count(*) > 1
)
update public.vigor_steps s
set step_count = m.step_count,
    logged_at = m.logged_at
from merged_steps m
where s.id = m.keep_id;

delete from public.vigor_steps
where id in (
  select id from (
    select id, row_number() over (partition by user_id, local_date order by id) as rn
    from public.vigor_steps
    where local_date is not null
  ) t
  where t.rn > 1
);

alter table public.vigor_sleep
  alter column local_date set not null,
  alter column local_date set default (timezone('utc', now()))::date,
  add constraint vigor_sleep_user_local_date_key unique (user_id, local_date);

alter table public.vigor_steps
  alter column local_date set not null,
  alter column local_date set default (timezone('utc', now()))::date,
  add constraint vigor_steps_user_local_date_key unique (user_id, local_date);

create or replace function public.process_health_connect_log_trigger()
returns trigger
language plpgsql
security definer
as $function$
declare
    p_json jsonb;
    v_user_id uuid;
    v_user_email text;
    v_steps_count int;
    v_sleep_minutes int;
    v_weight_kg numeric;
    v_logged_at timestamptz;
    v_local_date date;
    v_match_date date;
    v_hrv_rmssd numeric;
    v_resting_hr int;
    v_body_fat_percent numeric;
    v_lean_body_mass_kg numeric;
    v_muscle_percent numeric;
    v_spo2_percent numeric;
    v_respiratory_rate numeric;
    v_height_cm numeric;
    v_deep_minutes int;
    v_light_minutes int;
    v_rem_minutes int;
    v_awake_minutes int;

    -- variables for looping
    v_step_item jsonb;
    v_sleep_item jsonb;
    v_weight_item jsonb;
    v_date_str text;
begin
    if new.payload is null or new.payload = '' then
        return new;
    end if;

    begin
        p_json := new.payload::jsonb;
    exception when others then
        return new;
    end;

    v_user_id := (p_json->>'user_id')::uuid;
    v_user_email := p_json->>'user_email';

    if v_user_id is null and v_user_email is not null and v_user_email <> '' then
        select id into v_user_id from auth.users where lower(email) = lower(v_user_email) limit 1;
    end if;

    if v_user_id is null then
        return new;
    end if;

    v_logged_at := coalesce(new.created_at, now());

    -- The device's own local calendar date, sent by Pulse. Falls back to the DB
    -- session's date cast of logged_at for any client that hasn't updated yet.
    v_local_date := nullif(p_json->>'local_date', '')::date;
    v_match_date := coalesce(v_local_date, v_logged_at::date);

    v_steps_count := (p_json->>'steps_count')::int;
    v_sleep_minutes := (p_json->>'sleep_minutes')::int;
    v_weight_kg := (p_json->>'weight_kg')::numeric;

    -- Real HRV (rMSSD) and resting HR: single "latest reading" scalars from Health Connect,
    -- not per-day historical lists like steps/sleep/weight. Only ever attached to today's
    -- vigor_sleep row (updated below), never used to fabricate a new sleep row on their own,
    -- since duration_minutes is NOT NULL on that table.
    v_hrv_rmssd := nullif(p_json->>'hrv_rmssd', '')::numeric;
    v_resting_hr := nullif(p_json->>'resting_heart_rate_bpm', '')::int;
    if v_hrv_rmssd is not null and v_hrv_rmssd <= 0 then v_hrv_rmssd := null; end if;
    if v_resting_hr is not null and v_resting_hr <= 0 then v_resting_hr := null; end if;

    -- Same "latest reading" shape as HRV/resting HR above.
    v_body_fat_percent := nullif(p_json->>'body_fat_percent', '')::numeric;
    v_lean_body_mass_kg := nullif(p_json->>'lean_body_mass_kg', '')::numeric;
    if v_body_fat_percent is not null and v_body_fat_percent <= 0 then v_body_fat_percent := null; end if;
    if v_lean_body_mass_kg is not null and v_lean_body_mass_kg <= 0 then v_lean_body_mass_kg := null; end if;
    -- vigor_weight.muscle_mass is stored as a percentage (matches the existing
    -- BLE-scale path), but Health Connect's LeanBodyMassRecord is in kg - convert.
    if v_lean_body_mass_kg is not null and v_weight_kg is not null and v_weight_kg > 0 then
        v_muscle_percent := round((v_lean_body_mass_kg / v_weight_kg) * 100, 1);
    end if;

    v_spo2_percent := nullif(p_json->>'spo2_percent', '')::numeric;
    v_respiratory_rate := nullif(p_json->>'respiratory_rate', '')::numeric;
    if v_spo2_percent is not null and v_spo2_percent <= 0 then v_spo2_percent := null; end if;
    if v_respiratory_rate is not null and v_respiratory_rate <= 0 then v_respiratory_rate := null; end if;

    v_height_cm := nullif(p_json->>'height_cm', '')::numeric;
    if v_height_cm is not null and v_height_cm <= 0 then v_height_cm := null; end if;

    -- Sleep stage minutes: only sent for "today" (the most recent sleep session),
    -- same latest-reading shape as HRV - Pulse doesn't backfill historical stages.
    v_deep_minutes := nullif(p_json->>'sleep_deep_minutes', '')::int;
    v_light_minutes := nullif(p_json->>'sleep_light_minutes', '')::int;
    v_rem_minutes := nullif(p_json->>'sleep_rem_minutes', '')::int;
    v_awake_minutes := nullif(p_json->>'sleep_awake_minutes', '')::int;

    -- 0. Sync height to profiles, if Health Connect has a reading and it's more
    -- current than whatever's on file (rarely changes, but free to keep in sync).
    if v_height_cm is not null then
        update public.profiles set height_cm = v_height_cm where id = v_user_id;
    end if;

    -- A. Process flat today statistics (default fallback)
    -- 1. Insert/Update public.vigor_steps (today) - atomic upsert, keyed on local_date.
    if v_steps_count is not null and v_steps_count > 0 then
        insert into public.vigor_steps (id, user_id, step_count, logged_at, local_date)
        values (gen_random_uuid(), v_user_id, v_steps_count, v_logged_at, v_match_date)
        on conflict (user_id, local_date) do update
          set step_count = excluded.step_count,
              logged_at = excluded.logged_at;
    end if;

    -- 2. Insert/Update public.vigor_sleep (today) - duration, stages, HRV, resting HR,
    -- SpO2, respiratory rate. Atomic upsert, keyed on local_date; per-field coalesce
    -- preserves any existing value this particular sync didn't carry.
    if v_sleep_minutes is not null and v_sleep_minutes > 0 then
        insert into public.vigor_sleep (
            id, user_id, duration_minutes, logged_at, hrv_ms, resting_hr,
            spo2_percent, respiratory_rate, deep_minutes, light_minutes, rem_minutes, awake_minutes, local_date
        )
        values (
            gen_random_uuid(), v_user_id, v_sleep_minutes, v_logged_at, v_hrv_rmssd, v_resting_hr,
            v_spo2_percent, v_respiratory_rate, v_deep_minutes, v_light_minutes, v_rem_minutes, v_awake_minutes, v_match_date
        )
        on conflict (user_id, local_date) do update
          set duration_minutes = excluded.duration_minutes,
              logged_at = excluded.logged_at,
              hrv_ms = coalesce(excluded.hrv_ms, vigor_sleep.hrv_ms),
              resting_hr = coalesce(excluded.resting_hr, vigor_sleep.resting_hr),
              spo2_percent = coalesce(excluded.spo2_percent, vigor_sleep.spo2_percent),
              respiratory_rate = coalesce(excluded.respiratory_rate, vigor_sleep.respiratory_rate),
              deep_minutes = coalesce(excluded.deep_minutes, vigor_sleep.deep_minutes),
              light_minutes = coalesce(excluded.light_minutes, vigor_sleep.light_minutes),
              rem_minutes = coalesce(excluded.rem_minutes, vigor_sleep.rem_minutes),
              awake_minutes = coalesce(excluded.awake_minutes, vigor_sleep.awake_minutes);
    elsif v_hrv_rmssd is not null or v_resting_hr is not null or v_spo2_percent is not null or v_respiratory_rate is not null then
        -- No sleep duration in this sync, but we do have a real vitals reading -
        -- attach it to today's existing sleep row if one exists; can't create a new
        -- row since duration_minutes is required.
        update public.vigor_sleep
        set hrv_ms = coalesce(v_hrv_rmssd, hrv_ms),
            resting_hr = coalesce(v_resting_hr, resting_hr),
            spo2_percent = coalesce(v_spo2_percent, spo2_percent),
            respiratory_rate = coalesce(v_respiratory_rate, respiratory_rate)
        where user_id = v_user_id and local_date = v_match_date;
    end if;

    -- 3. Insert/Update public.vigor_weight (today) - weight, body fat %, muscle %.
    -- No uniqueness constraint on this table (multiple weigh-ins/day is intentional),
    -- so this stays a check-then-act upsert rather than ON CONFLICT.
    if v_weight_kg is not null and v_weight_kg > 0 then
        if exists (
            select 1 from public.vigor_weight
            where user_id = v_user_id and local_date = v_match_date
        ) then
            update public.vigor_weight
            set weight = v_weight_kg,
                logged_at = v_logged_at,
                body_fat = coalesce(v_body_fat_percent, body_fat),
                muscle_mass = coalesce(v_muscle_percent, muscle_mass)
            where user_id = v_user_id and local_date = v_match_date;
        else
            insert into public.vigor_weight (id, user_id, weight, logged_at, body_fat, muscle_mass, local_date)
            values (gen_random_uuid(), v_user_id, v_weight_kg, v_logged_at, v_body_fat_percent, v_muscle_percent, v_match_date);
        end if;
    end if;

    -- B. Process 30-day historical lists if present. These date strings are already
    -- device-local (Pulse computes them via ZonedDateTime.atZone(systemZone)), so
    -- local_date = v_date_str::date is correct, not a fallback.
    -- 1. Loop over daily_steps - atomic upsert closes the race that produced today's
    -- confirmed duplicate rows (two overlapping syncs both inserting the same day).
    if p_json->'daily_steps' is not null and jsonb_array_length(p_json->'daily_steps') > 0 then
        for v_step_item in select * from jsonb_array_elements(p_json->'daily_steps') loop
            v_date_str := v_step_item->>'date';
            v_steps_count := (v_step_item->>'steps')::int;

            if v_date_str is not null and v_steps_count is not null and v_steps_count > 0 then
                insert into public.vigor_steps (id, user_id, step_count, logged_at, local_date)
                values (gen_random_uuid(), v_user_id, v_steps_count, (v_date_str || ' 12:00:00+00')::timestamptz, v_date_str::date)
                on conflict (user_id, local_date) do update
                  set step_count = excluded.step_count,
                      logged_at = excluded.logged_at;
            end if;
        end loop;
    end if;

    -- 2. Loop over daily_sleep
    if p_json->'daily_sleep' is not null and jsonb_array_length(p_json->'daily_sleep') > 0 then
        for v_sleep_item in select * from jsonb_array_elements(p_json->'daily_sleep') loop
            v_date_str := v_sleep_item->>'date';
            v_sleep_minutes := (v_sleep_item->>'duration_minutes')::int;

            if v_date_str is not null and v_sleep_minutes is not null and v_sleep_minutes > 0 then
                insert into public.vigor_sleep (id, user_id, duration_minutes, logged_at, local_date)
                values (gen_random_uuid(), v_user_id, v_sleep_minutes, (v_date_str || ' 12:00:00+00')::timestamptz, v_date_str::date)
                on conflict (user_id, local_date) do update
                  set duration_minutes = excluded.duration_minutes,
                      logged_at = excluded.logged_at;
            end if;
        end loop;
    end if;

    -- 3. Loop over daily_weight - no unique constraint, keep check-then-act.
    if p_json->'daily_weight' is not null and jsonb_array_length(p_json->'daily_weight') > 0 then
        for v_weight_item in select * from jsonb_array_elements(p_json->'daily_weight') loop
            v_date_str := v_weight_item->>'date';
            v_weight_kg := (v_weight_item->>'weight_kg')::numeric;

            if v_date_str is not null and v_weight_kg is not null and v_weight_kg > 0 then
                if exists (
                    select 1 from public.vigor_weight
                    where user_id = v_user_id and local_date = v_date_str::date
                ) then
                    update public.vigor_weight
                    set weight = v_weight_kg,
                        logged_at = (v_date_str || ' 12:00:00+00')::timestamptz
                    where user_id = v_user_id and local_date = v_date_str::date;
                else
                    insert into public.vigor_weight (id, user_id, weight, logged_at, local_date)
                    values (gen_random_uuid(), v_user_id, v_weight_kg, (v_date_str || ' 12:00:00+00')::timestamptz, v_date_str::date);
                end if;
            end if;
        end loop;
    end if;

    return new;
end;
$function$;
