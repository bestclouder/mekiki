import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client for ingestion / webhooks.
 *
 * Uses the service-role key when available (bypasses RLS). Falls back to the
 * anon key, which still works for writes under the v1 permissive RLS policies
 * (see supabase/migrations/0001_init.sql). NEVER import this into client code.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and a key",
    );
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
