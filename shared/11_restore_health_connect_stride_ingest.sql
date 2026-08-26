-- ==========================================================================
-- Restore Health Connect -> Stride workout ingestion
-- ==========================================================================
--
-- 09_secure_health_connect_ingest.sql closed the ingest IDOR and removed the
-- LAN HTTP bridge (LocalHttpServer.kt). That was right for steps/sleep/weight,
-- which all flow through the authenticated RPC - but the LAN bridge was also
-- the ONLY path that ever populated public.stride_activities from Health
-- Connect: shared/services/healthConnectSync.ts pulled the phone's exercise
-- list and ran transformExerciseForStride() over it. Both were deleted, and
-- the replacement payload carried only 'exercise_sessions_count' (a bare
-- integer), so Zenith Stride silently stopped receiving Health-Connect-sourced
-- workouts while Hub's Integrations page still advertised that sync.
--
-- Pulse now sends a full 'exercise_sessions' array (see ZenithSyncManager.kt).
--
-- This is deliberately a SEPARATE trigger rather than an edit to
-- process_health_connect_log_trigger(). That function has been modified
-- directly against the live project more than once (09's own header notes it
-- "was superseded out-of-band"), so the checked-in copy is not a reliable
-- base to rewrite from - regenerating it from this repo would silently revert
-- live-only logic such as the profiles.height_cm sync and the biometrics-only
-- update branch. Keeping exercise ingestion in its own function means this
-- migration is purely additive and cannot clobber that drift.
--
-- Identity comes from the authenticated row (new.user_id) stamped by
-- health_connect_ingest(), never from anything the client puts in the payload.
--
-- On fields Health Connect's ExerciseSessionRecord doesn't give us:
-- per-session distance, heart rate, calories and shoe data were never actually
-- populated by the old path either (the LAN payload only carried
-- type/start/end/duration, so the TS transform's distance_withers and
-- avg_cadence_spm reads were always undefined -> 0/null). They stay unset here
-- rather than being filled with plausible-looking fabricated numbers.

create or replace function public.process_health_connect_exercise_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
    p_json jsonb;
    v_user_id uuid;
    v_ex_item jsonb;
    v_ex_start timestamptz;
    v_ex_type text;
    v_ex_origin text;
    v_ex_duration int;
    v_ex_date date;
    v_ex_time text;
    v_ex_is_polar boolean;
    v_ex_is_treadmill boolean;
    v_ex_title text;
    v_ex_kind text;
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

    -- Mirrors transformExerciseForStride() from the removed
    -- shared/services/healthConnectSync.ts: Polar-origin sessions and exercise
    -- type 57 are treadmill runs, 56 is an outdoor run, anything else logs as
    -- a generic easy session.
    for v_ex_item in select * from jsonb_array_elements(p_json->'exercise_sessions') loop
        begin
            v_ex_start := nullif(v_ex_item->>'start_time', '')::timestamptz;
            v_ex_duration := coalesce(nullif(v_ex_item->>'duration_seconds', '')::int, 0);
            v_ex_type := coalesce(v_ex_item->>'type', '');
            v_ex_origin := coalesce(v_ex_item->>'data_origin', '');

            -- A session with no start time can't be placed on a calendar day,
            -- and a zero-length one carries no training signal.
            if v_ex_start is null or v_ex_duration <= 0 then
                continue;
            end if;

            v_ex_date := v_ex_start::date;
            v_ex_time := to_char(v_ex_start, 'HH24:MI');
            v_ex_is_polar := (v_ex_origin = 'fi.polar.polarflow');
            v_ex_is_treadmill := (v_ex_type = '57' or v_ex_is_polar);

            if v_ex_is_polar then
                v_ex_title := 'Polar Treadmill Run';
            elsif v_ex_is_treadmill then
                v_ex_title := 'Health Connect Treadmill Workout';
            else
                v_ex_title := 'Health Connect Run Workout';
            end if;

            v_ex_kind := case when v_ex_is_treadmill then 'treadmill' else 'easy' end;

            -- Idempotent across re-syncs (Pulse resends a rolling 30-day window
            -- every hour) without collapsing two genuinely different sessions on
            -- the same day into one, which the old date-only dedupe did.
            if not exists (
                select 1 from public.stride_activities
                where user_id = v_user_id
                  and date = v_ex_date
                  and time_of_day = v_ex_time
                  and duration_sec = v_ex_duration
            ) then
                insert into public.stride_activities (
                    user_id, title, date, time_of_day, type, is_treadmill,
                    incline_percent, distance_km, duration_sec, avg_pace_min_km,
                    elevation_gain_m, source, notes
                )
                values (
                    v_user_id, v_ex_title, v_ex_date, v_ex_time, v_ex_kind, v_ex_is_treadmill,
                    0, 0, v_ex_duration, 0,
                    0,
                    case when v_ex_is_polar then 'polar' else 'health_connect' end,
                    'Imported via ' || case when v_ex_is_polar then 'Polar Flow / ' else '' end || 'Health Connect'
                );
            end if;
        exception when others then
            -- One malformed session must not abort the sync; the steps/sleep/
            -- weight rows written by the sibling trigger are unaffected.
            continue;
        end;
    end loop;

    return new;
end;
$function$;

drop trigger if exists trg_process_health_connect_exercise on public.health_connect_logs;
create trigger trg_process_health_connect_exercise
after insert on public.health_connect_logs
for each row execute function public.process_health_connect_exercise_trigger();

-- Trigger invocation runs with the function owner's privileges regardless of
-- ACL, so no EXECUTE grant is needed for it to fire. Every function in the
-- public schema is auto-exposed by PostgREST as a callable RPC though, so
-- revoke direct-call access explicitly.
revoke execute on function public.process_health_connect_exercise_trigger() from public, anon, authenticated;
