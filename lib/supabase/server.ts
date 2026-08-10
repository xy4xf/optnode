// Server-only Supabase client (service role).
//
// All database access in this app happens inside Route Handlers using the
// service role key, which bypasses Row Level Security. The service key MUST
// never be shipped to the browser — keep it in server-only env vars. Tables
// have RLS enabled with no policies, so the anon key (if ever leaked) can read
// or write nothing.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Lazily build the service-role Supabase client. Throws a descriptive error if
 * the env vars are missing so misconfiguration fails fast instead of silently
 * returning null rows.
 */
export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env"
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Public base URL for building absolute short / download links. */
export function getBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
