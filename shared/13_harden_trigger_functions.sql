-- ==========================================================================
-- Harden SECURITY DEFINER / trigger functions
-- ==========================================================================
--
-- Surfaced by Supabase's own security advisor after the Health Connect work.
-- 09_secure_health_connect_ingest.sql revoked direct RPC access on the
-- health-connect trigger functions, but the ecosystem's other trigger
-- functions had never been given the same treatment.
--
-- Two problems, both applying to functions that already existed:
--
-- 1. Mutable search_path. Without a pinned search_path the CALLER decides
--    which schema an unqualified name resolves to. For a SECURITY DEFINER
--    function - which runs as its owner - that is a privilege-escalation path:
--    a caller can prepend a schema containing their own `profiles` table (or
--    their own function shadowing a built-in) and have the definer-privileged
--    body operate on it.
--
-- 2. Trigger functions exposed as callable RPCs. Every function in the public
--    schema is auto-published by PostgREST, so `create_profile_for_new_user`
--    and `sync_vigor_weight_to_profile` were directly invocable over HTTP as
--    SECURITY DEFINER - the first of them even by the anon role. Trigger
--    invocation runs with the owner's privileges regardless of ACL, so
--    revoking EXECUTE does not affect the triggers themselves.
--
-- ALTER FUNCTION is used deliberately instead of CREATE OR REPLACE: several of
-- these have been edited directly against the live project, so regenerating a
-- body from this repo risks reverting live-only logic. ALTER changes only the
-- attribute.

alter function public.create_profile_for_new_user() set search_path = public, pg_temp;
alter function public.sync_vigor_weight_to_profile() set search_path = public, pg_temp;
alter function public.guard_profiles_is_pro() set search_path = public, pg_temp;
alter function public.activate_pro_trial() set search_path = public, pg_temp;

revoke execute on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke execute on function public.sync_vigor_weight_to_profile() from public, anon, authenticated;
revoke execute on function public.guard_profiles_is_pro() from public, anon, authenticated;

-- activate_pro_trial stays callable on purpose: it is the sanctioned RPC a
-- signed-in user calls to activate their own entitlement (see shared/pro.ts).
--
-- health_connect_ingest also stays callable by `authenticated` on purpose -
-- that is the whole point of the IDOR fix. It is SECURITY DEFINER, derives the
-- user from auth.uid() rather than the payload, and is revoked from anon.
