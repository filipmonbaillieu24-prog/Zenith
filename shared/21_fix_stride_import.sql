-- Stride imports from Health Connect.
--
-- Three faults, all in one trigger:
--
--  1. `v_ex_is_treadmill := (v_ex_type = '57' or v_ex_is_polar)` declared EVERY session
--     from Polar Flow a treadmill run. Polar Flow is the app the data came through; it
--     says nothing about where the run happened. Health Connect already draws the
--     distinction - 56 is running, 57 is running on a treadmill - and today's outdoor
--     run arrived correctly typed 56 and was relabelled anyway.
--  2. distance, pace, heart rate and calories were hardcoded to 0, because the app
--     never sent them. It does now, so they are read.
--  3. time_of_day came from to_char() on a timestamptz, which renders in the server's
--     UTC. An evening session was stamped hours early, and near midnight landed on the
--     wrong date. The app now sends the session's own local start time.
--
-- The dedupe key changes with it: (date, time_of_day, duration) let the same session
-- in twice once its stamped time shifted, which is how 2026-08-15 ended up with two
-- rows for one run. Matching on the start instant with a tolerance cannot drift.

create or replace function public.process_health_connect_exercise_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    p_json jsonb;
    v_user_id uuid;
    v_ex_item jsonb;
    v_ex_start timestamptz;
    v_ex_start_local timestamp;
    v_ex_type text;
    v_ex_origin text;
    v_ex_duration int;
    v_ex_date date;
    v_ex_time text;
    v_ex_is_treadmill boolean;
    v_ex_title text;
    v_ex_kind text;
    v_distance_km numeric;
    v_pace numeric;
    v_avg_hr int;
    v_max_hr int;
    v_calories int;
    v_steps bigint;
    v_cadence int;
    v_existing_id uuid;
begin
    if new.payload is null or new.payload = '' then
        return new;
    end if;

    begin
        p_json := new.payload::jsonb;
    exception when others then
        return new;
    end;

    v_user_id := new.user_id;
    if v_user_id is null then
        return new;
    end if;

    if p_json->'exercise_sessions' is null
       or jsonb_typeof(p_json->'exercise_sessions') <> 'array'
       or jsonb_array_length(p_json->'exercise_sessions') = 0 then
        return new;
    end if;

    for v_ex_item in select * from jsonb_array_elements(p_json->'exercise_sessions') loop
        begin
            v_ex_start := nullif(v_ex_item->>'start_time', '')::timestamptz;
            v_ex_duration := coalesce(nullif(v_ex_item->>'duration_seconds', '')::int, 0);
            v_ex_type := coalesce(v_ex_item->>'type', '');
            v_ex_origin := coalesce(v_ex_item->>'data_origin', '');

            if v_ex_start is null or v_ex_duration <= 0 then
                continue;
            end if;

            -- Local wall-clock start where the app sent one. Older app versions did
            -- not, and for those the UTC instant is all there is - wrong by the
            -- offset, but no worse than it already was.
            v_ex_start_local := nullif(v_ex_item->>'start_local', '')::timestamp;
            if v_ex_start_local is not null then
                v_ex_date := v_ex_start_local::date;
                v_ex_time := to_char(v_ex_start_local, 'HH24:MI');
            else
                v_ex_date := v_ex_start::date;
                v_ex_time := to_char(v_ex_start, 'HH24:MI');
            end if;

            -- Health Connect exercise types: 56 running, 57 running on a treadmill,
            -- 79 walking, 37 hiking. Only 57 is a treadmill, whatever app the data
            -- came through.
            v_ex_is_treadmill := (v_ex_type = '57');

            -- Stride is a running log; anything that is not running, walking or
            -- hiking has no business being written to it as a run.
            if v_ex_type not in ('56', '57', '79', '37') then
                continue;
            end if;

            -- The device already named the session. "Hardlopen" beats a title this
            -- function invents, and inventing "Polar Treadmill Run" for an outdoor
            -- run is how the mislabelling became visible in the first place.
            v_ex_title := nullif(trim(coalesce(v_ex_item->>'title', '')), '');
            if v_ex_title is null or v_ex_title = 'Workout' then
                v_ex_title := case
                    when v_ex_is_treadmill then 'Treadmill Run'
                    when v_ex_type = '56' then 'Run'
                    when v_ex_type = '79' then 'Walk'
                    else 'Hike'
                end;
            end if;

            v_ex_kind := case
                when v_ex_is_treadmill then 'treadmill'
                when v_ex_type = '79' then 'walk'
                when v_ex_type = '37' then 'hike'
                else 'easy'
            end;

            v_distance_km := round(coalesce(nullif(v_ex_item->>'distance_meters', '')::numeric, 0) / 1000.0, 2);
            v_avg_hr := nullif(coalesce(nullif(v_ex_item->>'avg_heart_rate', '')::int, 0), 0);
            v_max_hr := nullif(coalesce(nullif(v_ex_item->>'max_heart_rate', '')::int, 0), 0);
            v_calories := nullif(round(coalesce(nullif(v_ex_item->>'calories', '')::numeric, 0))::int, 0);
            v_steps := coalesce(nullif(v_ex_item->>'steps', '')::bigint, 0);

            -- Pace is minutes per kilometre and only means anything with a distance.
            -- Zero is not "no distance recorded", it is a claim of instant running.
            v_pace := case
                when v_distance_km > 0 then round((v_ex_duration / 60.0) / v_distance_km, 2)
                else null
            end;

            -- Steps per minute, from the session's own step count.
            v_cadence := case
                when v_steps > 0 and v_ex_duration > 0 then round(v_steps / (v_ex_duration / 60.0))::int
                else null
            end;

            -- Match on the start instant with a three-minute tolerance, rather than on
            -- a rendered clock time that shifts with whatever timezone read it.
            select sa.id into v_existing_id
            from public.stride_activities sa
            where sa.user_id = v_user_id
              and sa.duration_sec between v_ex_duration - 60 and v_ex_duration + 60
              and sa.date between v_ex_date - 1 and v_ex_date + 1
              and abs(extract(epoch from (
                    (sa.date + coalesce(nullif(sa.time_of_day, '') || ':00', '00:00:00')::time)::timestamp
                    - coalesce(v_ex_start_local, v_ex_start::timestamp)
                  ))) < 180
            limit 1;

            if v_existing_id is not null then
                -- Enrich, never overwrite. Rows imported before the app sent distance
                -- and heart rate would otherwise stay at 0 km forever, because the
                -- ingest only ever inserted. Fields already holding a value are left
                -- exactly as they are, and a row the athlete has edited by hand is not
                -- touched at all - a correction they made must not be undone by the
                -- next sync.
                update public.stride_activities sa set
                    distance_km      = case when coalesce(sa.distance_km, 0) = 0 and v_distance_km > 0 then v_distance_km else sa.distance_km end,
                    avg_pace_min_km  = case when coalesce(sa.avg_pace_min_km, 0) = 0 and v_pace is not null then v_pace else sa.avg_pace_min_km end,
                    avg_heart_rate   = coalesce(sa.avg_heart_rate, v_avg_hr),
                    max_heart_rate   = coalesce(sa.max_heart_rate, v_max_hr),
                    avg_cadence_spm  = coalesce(sa.avg_cadence_spm, v_cadence),
                    calories         = coalesce(sa.calories, v_calories),
                    -- Where the session happened is not a matter of opinion, and the
                    -- stored value came from a rule that got it wrong for every
                    -- outdoor run. Health Connect's own type is authoritative.
                    is_treadmill     = v_ex_is_treadmill,
                    type             = case when sa.type in ('treadmill', 'easy', 'walk', 'hike') then v_ex_kind else sa.type end,
                    time_of_day      = case when v_ex_start_local is not null then v_ex_time else sa.time_of_day end,
                    date             = case when v_ex_start_local is not null then v_ex_date else sa.date end
                where sa.id = v_existing_id
                  and sa.manually_edited = false;
            else
                insert into public.stride_activities (
                    user_id, title, date, time_of_day, type, is_treadmill,
                    incline_percent, distance_km, duration_sec, avg_pace_min_km,
                    elevation_gain_m, avg_heart_rate, max_heart_rate, avg_cadence_spm,
                    calories, source, notes
                )
                values (
                    v_user_id, v_ex_title, v_ex_date, v_ex_time, v_ex_kind, v_ex_is_treadmill,
                    0, v_distance_km, v_ex_duration, v_pace,
                    0, v_avg_hr, v_max_hr, v_cadence,
                    v_calories,
                    case when v_ex_origin = 'fi.polar.polarflow' then 'polar' else 'health_connect' end,
                    'Imported from Health Connect'
                      || case when v_ex_origin <> '' then ' (' || v_ex_origin || ')' else '' end
                );
            end if;
        exception when others then
            continue;
        end;
    end loop;

    return new;
end;
$function$;
