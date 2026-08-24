-- Expands the Zenith Pulse -> Supabase ingest pipeline to stop dropping data
-- it already receives.
--
-- Zenith Pulse's ZenithSyncManager.kt posts a BIOMETRIC_FULL payload straight
-- to the health_connect_ingest() RPC, which logs it into health_connect_logs;
-- the trg_process_health_connect_log trigger below then parses that JSON and
-- upserts into vigor_steps/vigor_sleep/vigor_weight. That trigger already
-- handles steps, sleep duration, weight, HRV, and resting heart rate
-- correctly — but the payload also already carries body_fat_percent,
-- lean_body_mass_kg, spo2_percent, respiratory_rate, and height_cm, none of
-- which the trigger ever reads. This migration wires those up, plus new
-- sleep-stage-minute fields the Pulse app will start sending (see the
-- accompanying HealthConnectManager.kt / ZenithSyncManager.kt changes).
--
-- vigor_weight.body_fat/muscle_mass already exist (as percentages); this
-- adds the two vigor_sleep columns that don't exist yet.

alter table public.vigor_sleep
  add column if not exists spo2_percent numeric,
  add column if not exists respiratory_rate numeric;

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
    -- BLE-scale path), but Health Connect's LeanBodyMassRecord is in kg — convert.
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
    -- same latest-reading shape as HRV — Pulse doesn't backfill historical stages.
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
    -- 1. Insert/Update public.vigor_steps (today)
    if v_steps_count is not null and v_steps_count > 0 then
        if exists (
            select 1 from public.vigor_steps
            where user_id = v_user_id
              and logged_at::date = v_logged_at::date
        ) then
            update public.vigor_steps
            set step_count = v_steps_count,
                logged_at = v_logged_at
            where user_id = v_user_id
              and logged_at::date = v_logged_at::date;
        else
            insert into public.vigor_steps (id, user_id, step_count, logged_at)
            values (gen_random_uuid(), v_user_id, v_steps_count, v_logged_at);
        end if;
    end if;

    -- 2. Insert/Update public.vigor_sleep (today) — duration, stages, HRV, resting HR, SpO2, respiratory rate
    if v_sleep_minutes is not null and v_sleep_minutes > 0 then
        if exists (
            select 1 from public.vigor_sleep
            where user_id = v_user_id
              and logged_at::date = v_logged_at::date
        ) then
            update public.vigor_sleep
            set duration_minutes = v_sleep_minutes,
                logged_at = v_logged_at,
                hrv_ms = coalesce(v_hrv_rmssd, hrv_ms),
                resting_hr = coalesce(v_resting_hr, resting_hr),
                spo2_percent = coalesce(v_spo2_percent, spo2_percent),
                respiratory_rate = coalesce(v_respiratory_rate, respiratory_rate),
                deep_minutes = coalesce(v_deep_minutes, deep_minutes),
                light_minutes = coalesce(v_light_minutes, light_minutes),
                rem_minutes = coalesce(v_rem_minutes, rem_minutes),
                awake_minutes = coalesce(v_awake_minutes, awake_minutes)
            where user_id = v_user_id
              and logged_at::date = v_logged_at::date;
        else
            insert into public.vigor_sleep (
                id, user_id, duration_minutes, logged_at, hrv_ms, resting_hr,
                spo2_percent, respiratory_rate, deep_minutes, light_minutes, rem_minutes, awake_minutes
            )
            values (
                gen_random_uuid(), v_user_id, v_sleep_minutes, v_logged_at, v_hrv_rmssd, v_resting_hr,
                v_spo2_percent, v_respiratory_rate, v_deep_minutes, v_light_minutes, v_rem_minutes, v_awake_minutes
            );
        end if;
    elsif v_hrv_rmssd is not null or v_resting_hr is not null or v_spo2_percent is not null or v_respiratory_rate is not null then
        -- No sleep duration in this sync, but we do have a real vitals reading —
        -- attach it to today's existing sleep row if one exists; can't create a new
        -- row since duration_minutes is required.
        update public.vigor_sleep
        set hrv_ms = coalesce(v_hrv_rmssd, hrv_ms),
            resting_hr = coalesce(v_resting_hr, resting_hr),
            spo2_percent = coalesce(v_spo2_percent, spo2_percent),
            respiratory_rate = coalesce(v_respiratory_rate, respiratory_rate)
        where user_id = v_user_id
          and logged_at::date = v_logged_at::date;
    end if;

    -- 3. Insert/Update public.vigor_weight (today) — weight, body fat %, muscle %
    if v_weight_kg is not null and v_weight_kg > 0 then
        if exists (
            select 1 from public.vigor_weight
            where user_id = v_user_id
              and logged_at::date = v_logged_at::date
        ) then
            update public.vigor_weight
            set weight = v_weight_kg,
                logged_at = v_logged_at,
                body_fat = coalesce(v_body_fat_percent, body_fat),
                muscle_mass = coalesce(v_muscle_percent, muscle_mass)
            where user_id = v_user_id
              and logged_at::date = v_logged_at::date;
        else
            insert into public.vigor_weight (id, user_id, weight, logged_at, body_fat, muscle_mass)
            values (gen_random_uuid(), v_user_id, v_weight_kg, v_logged_at, v_body_fat_percent, v_muscle_percent);
        end if;
    end if;

    -- B. Process 30-day historical lists if present
    -- 1. Loop over daily_steps
    if p_json->'daily_steps' is not null and jsonb_array_length(p_json->'daily_steps') > 0 then
        for v_step_item in select * from jsonb_array_elements(p_json->'daily_steps') loop
            v_date_str := v_step_item->>'date';
            v_steps_count := (v_step_item->>'steps')::int;

            if v_date_str is not null and v_steps_count is not null and v_steps_count > 0 then
                if exists (
                    select 1 from public.vigor_steps
                    where user_id = v_user_id
                      and logged_at::date = v_date_str::date
                ) then
                    update public.vigor_steps
                    set step_count = v_steps_count,
                        logged_at = (v_date_str || ' 12:00:00+00')::timestamptz
                    where user_id = v_user_id
                      and logged_at::date = v_date_str::date;
                else
                    insert into public.vigor_steps (id, user_id, step_count, logged_at)
                    values (gen_random_uuid(), v_user_id, v_steps_count, (v_date_str || ' 12:00:00+00')::timestamptz);
                end if;
            end if;
        end loop;
    end if;

    -- 2. Loop over daily_sleep
    if p_json->'daily_sleep' is not null and jsonb_array_length(p_json->'daily_sleep') > 0 then
        for v_sleep_item in select * from jsonb_array_elements(p_json->'daily_sleep') loop
            v_date_str := v_sleep_item->>'date';
            v_sleep_minutes := (v_sleep_item->>'duration_minutes')::int;

            if v_date_str is not null and v_sleep_minutes is not null and v_sleep_minutes > 0 then
                if exists (
                    select 1 from public.vigor_sleep
                    where user_id = v_user_id
                      and logged_at::date = v_date_str::date
                ) then
                    update public.vigor_sleep
                    set duration_minutes = v_sleep_minutes,
                        logged_at = (v_date_str || ' 12:00:00+00')::timestamptz
                    where user_id = v_user_id
                      and logged_at::date = v_date_str::date;
                else
                    insert into public.vigor_sleep (id, user_id, duration_minutes, logged_at)
                    values (gen_random_uuid(), v_user_id, v_sleep_minutes, (v_date_str || ' 12:00:00+00')::timestamptz);
                end if;
            end if;
        end loop;
    end if;

    -- 3. Loop over daily_weight
    if p_json->'daily_weight' is not null and jsonb_array_length(p_json->'daily_weight') > 0 then
        for v_weight_item in select * from jsonb_array_elements(p_json->'daily_weight') loop
            v_date_str := v_weight_item->>'date';
            v_weight_kg := (v_weight_item->>'weight_kg')::numeric;

            if v_date_str is not null and v_weight_kg is not null and v_weight_kg > 0 then
                if exists (
                    select 1 from public.vigor_weight
                    where user_id = v_user_id
                      and logged_at::date = v_date_str::date
                ) then
                    update public.vigor_weight
                    set weight = v_weight_kg,
                        logged_at = (v_date_str || ' 12:00:00+00')::timestamptz
                    where user_id = v_user_id
                      and logged_at::date = v_date_str::date;
                else
                    insert into public.vigor_weight (id, user_id, weight, logged_at)
                    values (gen_random_uuid(), v_user_id, v_weight_kg, (v_date_str || ' 12:00:00+00')::timestamptz);
                end if;
            end if;
        end loop;
    end if;

    return new;
end;
$function$;
