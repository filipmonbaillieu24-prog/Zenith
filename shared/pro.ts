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
