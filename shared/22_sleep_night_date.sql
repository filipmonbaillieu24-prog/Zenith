-- ==========================================================================
-- File a night's sleep under the night it happened
-- ==========================================================================
--
-- process_health_connect_log_trigger() wrote the sleep row with v_match_date,
-- which is the phone's "today" at the moment of sync. But the stages and HRV in
-- that payload describe one specific session: whichever Health Connect record
-- has the latest endTime. Sync on a morning before the new night has been
-- written and the PREVIOUS night was stored a second time as today's sleep.
--
-- The result in this athlete's data, for two consecutive pairs:
--
--   2026-08-31  474 min  deep 77  rem 83  light 312  awake 2  hrv 54.74284105248328
--   2026-09-01  474 min  deep 77  rem 83  light 312  awake 2  hrv 54.74284105248328
--
-- Identical to fourteen decimal places, because it is one record written twice.
-- The same night therefore appeared as two, and because the copy landed on
-- "today" while the genuine reading for the day before had a higher rMSSD, the
-- series showed HRV collapsing overnight. Vigor read that as "Sympathetic
-- Overdrive / CNS Fatigue", and Kratos scaled the athlete's lifting targets to
-- 0.8x off it - a real training decision taken on a duplicated row.
--
-- Pulse now sends 'sleep_local_date': the local date of the morning the session
-- ended, which is exactly how the daily_sleep backfill array has always keyed
-- its entries. This uses it when present and falls back to the old behaviour
-- when it is absent, so installs that have not updated yet keep working.
--
-- Patched against the LIVE definition rather than regenerated from the repo.
-- 11_restore_health_connect_stride_ingest.sql records why: this function has
-- been edited out-of-band more than once, so the checked-in copy is not a safe
-- base to rewrite from - doing so would silently revert live-only logic such as
-- the profiles.height_cm sync. Each substitution is verified to have matched.

do $$
declare
  def text;
  before text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'process_health_connect_log_trigger';

  if def is null then
    raise exception 'process_health_connect_log_trigger() not found';
  end if;

  -- 1. Declare the night's date.
  before := def;
  def := replace(def, '    v_date_str text;', '    v_date_str text;' || chr(10) || '    v_sleep_date date;');
  if def = before then raise exception 'could not add v_sleep_date declaration'; end if;

  -- 2. Derive it, preferring the night's own date over the upload's date.
  before := def;
  def := replace(
    def,
    '    v_match_date := coalesce(v_local_date, v_logged_at::date);',
    '    v_match_date := coalesce(v_local_date, v_logged_at::date);' || chr(10) ||
    '    v_sleep_date := coalesce(nullif(p_json->>''sleep_local_date'', '''')::date, v_match_date);'
  );
  if def = before then raise exception 'could not derive v_sleep_date'; end if;

  -- 3. Write the sleep row under it.
  before := def;
  def := replace(
    def,
    'v_deep_minutes, v_light_minutes, v_rem_minutes, v_awake_minutes, v_match_date',
    'v_deep_minutes, v_light_minutes, v_rem_minutes, v_awake_minutes, v_sleep_date'
  );
  if def = before then raise exception 'could not repoint the vigor_sleep insert'; end if;

  -- 4. The biometrics-only branch updates that same night's row, so it moves too.
  before := def;
  def := replace(
    def,
    'respiratory_rate = coalesce(v_respiratory_rate, respiratory_rate)' || chr(10) ||
    '        where user_id = v_user_id and local_date = v_match_date;',
    'respiratory_rate = coalesce(v_respiratory_rate, respiratory_rate)' || chr(10) ||
    '        where user_id = v_user_id and local_date = v_sleep_date;'
  );
  if def = before then raise exception 'could not repoint the biometrics-only sleep update'; end if;

  execute def;
end $$;
