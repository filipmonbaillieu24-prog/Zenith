-- Server-side enforcement of the Zenith Pro entitlement.
--
-- Previously "Pro" status only ever lived in auth.users.user_metadata.is_pro,
-- which any authenticated user can set on themselves client-side via
-- supabase.auth.updateUser({ data: { is_pro: true } }) — the paywall was
-- UI-only. This migration moves the source of truth to profiles.is_pro,
-- guards it so it can only change through the activate_pro_trial() RPC
-- below, and enforces it in RLS on the two Pro-gated Vigor tables (plus the
-- progress-photos storage bucket).

alter table public.profiles
  add column if not exists is_pro boolean not null default false;

-- Backfill: preserve current Pro status for existing users so nobody loses
-- access they already effectively had (via user_metadata.is_pro, or the
-- previous hardcoded founder-email allowlist baked into the Vigor/Aero/Hub
-- clients).
update public.profiles p
set is_pro = true
from auth.users u
where u.id = p.id
  and (
    u.raw_user_meta_data->>'is_pro' = 'true'
    or lower(u.email) = 'filip.monbaillieu.24@gmail.com'
  );

-- --- Guard: is_pro can only change via activate_pro_trial() below ---------
-- Not SECURITY DEFINER — it doesn't need elevated rights. It only reverts an
-- attempted change to profiles.is_pro unless the current transaction was
-- specifically flagged (via activate_pro_trial()) to allow it. All other
-- profile fields are untouched by this trigger and remain freely editable
-- by their owner under the existing "Allow individual update" RLS policy.

create or replace function public.guard_profiles_is_pro()
returns trigger
language plpgsql
as $$
begin
  if new.is_pro is distinct from old.is_pro
     and coalesce(current_setting('app.allow_pro_change', true), '') <> 'true' then
    new.is_pro := old.is_pro;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profiles_is_pro on public.profiles;
create trigger trg_guard_profiles_is_pro
  before update on public.profiles
  for each row execute function public.guard_profiles_is_pro();

-- --- Activation RPC ---------------------------------------------------------
-- Stand-in for a real payment-webhook handler: the client still only
-- *simulates* a PayPal checkout (no real payment processor is wired up yet),
-- so this is not real payment verification either. What it does fix is the
-- trust boundary: activation is now a single server-side function instead of
-- an arbitrary client UPDATE, and the trigger above ensures this is the only
-- path that can ever flip is_pro to true.
create or replace function public.activate_pro_trial()
returns void
language plpgsql
as $$
begin
  perform set_config('app.allow_pro_change', 'true', true);
  update public.profiles set is_pro = true, updated_at = now() where id = auth.uid();
end;
$$;

grant execute on function public.activate_pro_trial() to authenticated;

-- --- Enforce Pro in RLS on the two Pro-gated Vigor tables ------------------

drop policy if exists "Users can manage their own measurements" on public.vigor_body_measurements;
create policy "Pro users can manage their own measurements" on public.vigor_body_measurements
  for all
  using (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_pro = true)
  )
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_pro = true)
  );

drop policy if exists "Users can manage their own progress photos" on public.vigor_progress_photos;
create policy "Pro users can manage their own progress photos" on public.vigor_progress_photos
  for all
  using (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_pro = true)
  )
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_pro = true)
  );

-- Storage: require Pro to upload progress photos (defense in depth — the
-- table insert above is already blocked for non-Pro users, but without this
-- a non-Pro user could still fill storage with orphaned image files).
drop policy if exists "Allow authenticated upload of progress photos" on storage.objects;
create policy "Allow pro users to upload progress photos" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'vigor-progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_pro = true)
  );
