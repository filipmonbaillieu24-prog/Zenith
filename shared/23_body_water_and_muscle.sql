-- ==========================================================================
-- Water and skeletal muscle from the scale reading
-- ==========================================================================
--
-- vigor_weight has had water_percent and muscle_mass columns all along, and Vigor
-- renders both. They showed "--" because nothing ever filled them: the ingest wrote
-- muscle_mass from lean_body_mass / weight, which is fat-free mass as a percentage
-- (about 74% for this athlete) rather than muscle (about 38%), and water was not
-- handled at all.
--
-- Pulse now derives both from the same impedance reading that produces body fat -
-- total body water from Sun et al. 2003, the same paper and cohort as the fat-free
-- mass equation beside it, and skeletal muscle from Janssen et al. 2000, validated
-- against MRI. Both arrive as percentages of body weight.
--
-- The lean-mass derivation stays as the fallback, so a client that has not updated
-- keeps whatever it had rather than losing the column.
--
-- Patched against the LIVE definition; the checked-in copy of this function has
-- drifted (see 11's header). Each substitution is verified to have matched.

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

  -- 1. Declare the two new figures.
  before := def;
  def := replace(def, '    v_muscle_percent numeric;',
    '    v_muscle_percent numeric;' || chr(10) ||
    '    v_water_percent numeric;');
  if def = before then raise exception 'could not declare v_water_percent'; end if;

  -- 2. Read them, preferring what Pulse derived over the lean-mass stand-in.
  before := def;
  def := replace(
    def,
    '    if v_lean_body_mass_kg is not null and v_weight_kg is not null and v_weight_kg > 0 then' || chr(10) ||
    '        v_muscle_percent := round((v_lean_body_mass_kg / v_weight_kg) * 100, 1);' || chr(10) ||
    '    end if;',
    '    if v_lean_body_mass_kg is not null and v_weight_kg is not null and v_weight_kg > 0 then' || chr(10) ||
    '        v_muscle_percent := round((v_lean_body_mass_kg / v_weight_kg) * 100, 1);' || chr(10) ||
    '    end if;' || chr(10) ||
    '    -- Skeletal muscle, where the client sends it, is the better answer than' || chr(10) ||
    '    -- fat-free mass wearing the name of muscle.' || chr(10) ||
    '    if nullif(p_json->>''skeletal_muscle_percent'', '''') is not null' || chr(10) ||
    '       and (p_json->>''skeletal_muscle_percent'')::numeric > 0 then' || chr(10) ||
    '        v_muscle_percent := round((p_json->>''skeletal_muscle_percent'')::numeric, 1);' || chr(10) ||
    '    end if;' || chr(10) ||
    '    v_water_percent := nullif(p_json->>''body_water_percent'', '''')::numeric;' || chr(10) ||
    '    if v_water_percent is not null and (v_water_percent <= 0 or v_water_percent > 80) then' || chr(10) ||
    '        v_water_percent := null;' || chr(10) ||
    '    end if;'
  );
  if def = before then raise exception 'could not derive the new figures'; end if;

  -- 3. Store water alongside the rest, on update and on insert.
  before := def;
  def := replace(
    def,
    '                body_fat = coalesce(v_body_fat_percent, body_fat),' || chr(10) ||
    '                muscle_mass = coalesce(v_muscle_percent, muscle_mass)',
    '                body_fat = coalesce(v_body_fat_percent, body_fat),' || chr(10) ||
    '                muscle_mass = coalesce(v_muscle_percent, muscle_mass),' || chr(10) ||
    '                water_percent = coalesce(v_water_percent, water_percent)'
  );
  if def = before then raise exception 'could not add water to the update'; end if;

  before := def;
  def := replace(
    def,
    'insert into public.vigor_weight (id, user_id, weight, logged_at, body_fat, muscle_mass, local_date)' || chr(10) ||
    '            values (gen_random_uuid(), v_user_id, v_weight_kg, v_logged_at, v_body_fat_percent, v_muscle_percent, v_match_date);',
    'insert into public.vigor_weight (id, user_id, weight, logged_at, body_fat, muscle_mass, water_percent, local_date)' || chr(10) ||
    '            values (gen_random_uuid(), v_user_id, v_weight_kg, v_logged_at, v_body_fat_percent, v_muscle_percent, v_water_percent, v_match_date);'
  );
  if def = before then raise exception 'could not add water to the insert'; end if;

  execute def;
end $$;
