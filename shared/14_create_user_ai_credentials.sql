-- ==========================================================================
-- Server-side storage for the user's own OpenAI key
-- ==========================================================================
--
-- The key previously lived in localStorage and was attached to a fetch made
-- straight from the browser to api.openai.com. That put it in plaintext on
-- disk in the browser profile and within reach of any script running on the
-- origin.
--
-- It now lives here and is read only by the `ai-chat` Edge Function using the
-- service role. The browser sends the conversation to that function and gets
-- back a completion; it never receives the key again after saving it.
--
-- See apps/zenith-aero/src/utils/ai.ts and supabase/functions/ai-chat/.

create table if not exists public.user_ai_credentials (
    user_id uuid primary key references auth.users(id) on delete cascade,
    openai_key text,
    openai_model text not null default 'gpt-4o-mini',
    updated_at timestamptz not null default now()
);

alter table public.user_ai_credentials enable row level security;

-- Deliberately NO select policy. A user may write and clear their own key but
-- can never read it back, so a compromised page cannot exfiltrate it even
-- holding a valid session. Only the Edge Function (service role) reads it.
drop policy if exists "Users can insert their own ai credentials" on public.user_ai_credentials;
create policy "Users can insert their own ai credentials"
on public.user_ai_credentials for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own ai credentials" on public.user_ai_credentials;
create policy "Users can update their own ai credentials"
on public.user_ai_credentials for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own ai credentials" on public.user_ai_credentials;
create policy "Users can delete their own ai credentials"
on public.user_ai_credentials for delete
to authenticated
using ((select auth.uid()) = user_id);

-- The settings UI needs to show whether a key is configured without being able
-- to read it, so this returns only a boolean.
create or replace function public.has_openai_key()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
    select exists (
        select 1 from public.user_ai_credentials
        where user_id = auth.uid()
          and openai_key is not null
          and openai_key <> ''
    );
$$;

revoke execute on function public.has_openai_key() from public, anon;
grant execute on function public.has_openai_key() to authenticated;
