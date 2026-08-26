-- Closes an IDOR in the Health Connect ingest pipeline: health_connect_ingest()
-- was granted to anon with an INSERT policy of WITH CHECK (true), and the
-- downstream trigger resolved WHICH user a payload applied to purely from
-- payload->>'user_id' / payload->>'user_email' - fields the caller fully
-- controls. Since the anon key ships inside the Zenith Pulse APK (extractable
-- by decompiling it), anyone could overwrite another user's weight/sleep/HRV/
-- height by POSTing a payload naming a different user_id or email.
--
-- Fix: identity now comes from the caller's own authenticated Supabase
-- session (auth.uid()), captured server-side by the SECURITY DEFINER RPC and
-- stamped onto the row - never trusted from the client-supplied JSON. The
-- payload's user_id/user_email fields are no longer read for identity at all.
-- Zenith Pulse already authenticates via Supabase Auth (see UserAuthManager.kt)
-- and now sends that session's access token on the sync request instead of
-- the anon key, so this requires no new auth flow on the client.
--
-- Note: the LIVE health_connect_ingest signature is a flat, multi-keyword-arg
-- function (id/timestamp/syncType/.../payload) matching the
-- mcnaveen/health-connect-webhook payload shape that Zenith Pulse actually
-- calls - it does not match the single `payload jsonb` signature originally
-- checked in as part of 03_create_health_connect_and_stride_tables.sql, which
-- was superseded out-of-band. This migration edits the function that is
-- actually live.

alter table public.health_connect_logs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- One-time, per-row-safe backfill for history (skips any row whose payload
-- isn't valid JSON rather than aborting the migration). Best-effort only, for
-- continuity of existing admin/debug queries - new rows never rely on this.
do $$
declare
  r record;
  v_uid uuid;
begin
  for r in select id, payload from public.health_connect_logs where user_id is null and payload is not null loop
    begin
      v_uid := (r.payload::jsonb ->> 'user_id')::uuid;
    exception when others then
      v_uid := null;
    end;
    if v_uid is not null then
      update public.health_connect_logs set user_id = v_uid where id = r.id;
    end if;
  end loop;
end $$;

create index if not exists health_connect_logs_user_id_idx on public.health_connect_logs (user_id);

-- Replaces the live flat-arg function in place (same signature Zenith Pulse's
-- ZenithSyncManager.kt already calls) - now requires an authenticated caller
-- and stamps the row with the caller's own auth.uid() instead of trusting
-- anything from the payload for identity.
create or replace function public.health_connect_ingest(
  id text DEFAULT NULL::text,
  "timestamp" bigint DEFAULT NULL::bigint,
  "syncType" text DEFAULT NULL::text,
  synctype text DEFAULT NULL::text,
  "dataType" text DEFAULT NULL::text,
  datatype text DEFAULT NULL::text,
  "recordCount" integer DEFAULT NULL::integer,
  recordcount integer DEFAULT NULL::integer,
  "responseTimeMs" integer DEFAULT NULL::integer,
  responsetimems integer DEFAULT NULL::integer,
  "errorMessage" text DEFAULT NULL::text,
  errormessage text DEFAULT NULL::text,
  success boolean DEFAULT NULL::boolean,
  url text DEFAULT NULL::text,
  payload text DEFAULT NULL::text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  INSERT INTO public.health_connect_logs (
      id, user_id, "timestamp", "syncType", synctype, "dataType", datatype,
      "recordCount", recordcount, payload
  )
  VALUES (
      COALESCE(id, gen_random_uuid()::text),
      v_uid,
      "timestamp",
      COALESCE("syncType", synctype),
      COALESCE(synctype, "syncType"),
      COALESCE("dataType", datatype),
      COALESCE(datatype, "dataType"),
      COALESCE("recordCount", recordcount),
      COALESCE(recordcount, "recordCount"),
      payload
  );
  RETURN jsonb_build_object('success', true, 'status', 'received');
END;
$function$;

-- Only an authenticated session may call it now - holding the anon key alone
-- (extractable from the Pulse APK) is no longer sufficient. Revoking from
-- PUBLIC (not just anon) matters: every role, including anon, is implicitly
-- a member of PUBLIC, so a leftover "GRANT EXECUTE ... TO PUBLIC" from when
-- this function was first created would silently keep it anon-callable even
-- after revoking anon's own explicit grant.
revoke execute on function public.health_connect_ingest(
  text, bigint, text, text, text, text, integer, integer, integer, integer, text, text, boolean, text, text
) from public;
grant execute on function public.health_connect_ingest(
  text, bigint, text, text, text, text, integer, integer, integer, integer, text, text, boolean, text, text
) to authenticated;

-- Insert policy matches: a row's user_id must equal the inserting session's
-- own uid. Combined with the RPC always stamping v_uid = auth.uid(), a direct
-- table insert (bypassing the RPC) is held to the same rule.
drop policy if exists "Allow insert for all" on public.health_connect_logs;
create policy "Users can insert their own health connect logs"
on public.health_connect_logs for insert
to authenticated
with check (auth.uid() = user_id);

-- The trigger now trusts only the authenticated user_id captured on the row
-- (NEW.user_id) - the payload->>'user_id' / payload->>'user_email' lookup is
-- removed entirely, since that was the actual spoofing vector.
create or replace function public.process_health_connect_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
    p_json jsonb;
    v_user_id uuid;
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

    -- Identity comes exclusively from the authenticated row stamped by
    -- health_connect_ingest(); a payload can no longer name a different user.
    v_user_id := new.user_id;
    if v_user_id is null then
        return new;
    end if;

    v_logged_at := coalesce(new.created_at, now());

    v_local_date := nullif(p_json->>'local_date', '')::date;
    v_match_date := coalesce(v_local_date, v_logged_at::date);

    v_steps_count := (p_json->>'steps_count')::int;
    v_sleep_minutes := (p_json->>'sleep_minutes')::int;
    v_weight_kg := (p_json->>'weight_kg')::numeric;

    v_hrv_rmssd := nullif(p_json->>'hrv_rmssd', '')::numeric;
    v_resting_hr := nullif(p_json->>'resting_heart_rate_bpm', '')::int;
    if v_hrv_rmssd is not null and v_hrv_rmssd <= 0 then v_hrv_rmssd := null; end if;
    if v_resting_hr is not null and v_resting_hr <= 0 then v_resting_hr := null; end if;

    v_body_fat_percent := nullif(p_json->>'body_fat_percent', '')::numeric;
    v_lean_body_mass_kg := nullif(p_json->>'lean_body_mass_kg', '')::numeric;
    if v_body_fat_percent is not null and v_body_fat_percent <= 0 then v_body_fat_percent := null; end if;
    if v_lean_body_mass_kg is not null and v_lean_body_mass_kg <= 0 then v_lean_body_mass_kg := null; end if;
    if v_lean_body_mass_kg is not null and v_weight_kg is not null and v_weight_kg > 0 then
        v_muscle_percent := round((v_lean_body_mass_kg / v_weight_kg) * 100, 1);
    end if;

    v_spo2_percent := nullif(p_json->>'spo2_percent', '')::numeric;
    v_respiratory_rate := nullif(p_json->>'respiratory_rate', '')::numeric;
    if v_spo2_percent is not null and v_spo2_percent <= 0 then v_spo2_percent := null; end if;
    if v_respiratory_rate is not null and v_respiratory_rate <= 0 then v_respiratory_rate := null; end if;

    v_height_cm := nullif(p_json->>'height_cm', '')::numeric;
    if v_height_cm is not null and v_height_cm <= 0 then v_height_cm := null; end if;

    v_deep_minutes := nullif(p_json->>'sleep_deep_minutes', '')::int;
    v_light_minutes := nullif(p_json->>'sleep_light_minutes', '')::int;
    v_rem_minutes := nullif(p_json->>'sleep_rem_minutes', '')::int;
    v_awake_minutes := nullif(p_json->>'sleep_awake_minutes', '')::int;

    if v_height_cm is not null then
        update public.profiles set height_cm = v_height_cm where id = v_user_id;
    end if;

    if v_steps_count is not null and v_steps_count > 0 then
        insert into public.vigor_steps (id, user_id, step_count, logged_at, local_date)
        values (gen_random_uuid(), v_user_id, v_steps_count, v_logged_at, v_match_date)
        on conflict (user_id, local_date) do update
          set step_count = excluded.step_count,
              logged_at = excluded.logged_at;
    end if;

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
        update public.vigor_sleep
        set hrv_ms = coalesce(v_hrv_rmssd, hrv_ms),
            resting_hr = coalesce(v_resting_hr, resting_hr),
            spo2_percent = coalesce(v_spo2_percent, spo2_percent),
            respiratory_rate = coalesce(v_respiratory_rate, respiratory_rate)
        where user_id = v_user_id and local_date = v_match_date;
    end if;

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

drop trigger if exists trg_process_health_connect_log on public.health_connect_logs;
create trigger trg_process_health_connect_log
after insert on public.health_connect_logs
for each row execute function public.process_health_connect_log_trigger();

-- This is a trigger function, not a public API - trigger invocation runs with
-- the function owner's privileges regardless of ACL, so it needs no EXECUTE
-- grant to fire. Every function in the public schema is auto-exposed by
-- PostgREST as a callable RPC though, so revoke direct-call access explicitly.
revoke execute on function public.process_health_connect_log_trigger() from public, anon, authenticated;
