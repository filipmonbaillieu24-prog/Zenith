import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Activates the caller's own Zenith Pro entitlement server-side.
 *
 * This is the only allowed write path to profiles.is_pro (enforced by a
 * Postgres trigger — see shared/05_add_pro_tier_gating.sql). Call this after
 * the (currently simulated) PayPal checkout succeeds, instead of writing
 * is_pro into auth user_metadata, which any signed-in client could set on
 * themselves.
 */
export async function activateProTrial(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc('activate_pro_trial');
  if (error) throw error;
}

/**
 * The founder account's email address.
 *
 * Single source of truth: this check was previously retyped as a string
 * literal in four places across Hub (App.tsx x3, ProfilePage.tsx), so editing
 * one and missing another would silently desync founder privileges between
 * pages. Note this is a convenience/UI gate only - it is not a security
 * boundary, since a client can claim any email in its own copy of the app.
 * Anything that must actually be restricted belongs behind RLS or an RPC.
 */
export const FOUNDER_EMAIL = 'filip.monbaillieu.24@gmail.com';

/** True when the given email is the founder account. Case-insensitive. */
export function isFounderEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === FOUNDER_EMAIL;
}
