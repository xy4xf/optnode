// Rate limiting backed by Supabase (works across instances, not in-memory).
//
// `rl_hit` (see supabase/schema.sql) atomically increments a per-minute bucket
// and returns the total hits within the sliding window for the given
// `ip:scope` prefix. One RPC round-trip per check.
//
// Buckets are keyed by minute, so old buckets naturally stop counting once they
// fall outside the window. A periodic cleanup of stale rows is optional.

import { getSupabase } from "@/lib/supabase/server";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  total: number;
}

function minuteBucket(): string {
  // Floor to minute; Date is allowed here (runtime request path, not a
  // build/cache context).
  const d = new Date();
  return `${d.getUTCFullYear()}${d.getUTCMonth() + 1}${d.getUTCDate()}${d.getUTCHours()}${d.getUTCMinutes()}`;
}

function sanitize(key: string): string {
  // Keep bucket keys filesystem/SQL-safe (IPs + scopes only).
  return key.replace(/[^a-zA-Z0-9.:_-]/g, "").slice(0, 128);
}

/**
 * Count this hit against `scope` for `ip` and decide if it exceeds `limit`
 * within the last `windowSec` seconds.
 *
 * `extra` is folded into the key so distinct limits (e.g. per-IP+code password
 * attempts) can share a scope but partition further.
 */
export async function rateLimit(
  scope: string,
  ip: string,
  limit: number,
  windowSec: number,
  extra = ""
): Promise<RateLimitResult> {
  const ipk = sanitize(ip);
  const ex = extra ? `:${sanitize(extra)}` : "";
  const prefix = `${ipk}:${scope}${ex}:`;
  const bucket = `${prefix}${minuteBucket()}`;

  const sb = getSupabase();
  const { data, error } = await sb.rpc("rl_hit", {
    p_prefix: prefix,
    p_bucket: bucket,
    p_window_secs: windowSec,
  });

  if (error) {
    // If rate limiting itself is broken, fail open (allow) rather than block
    // all users — the brute-force defenses layered above still apply.
    return { ok: true, remaining: limit, total: 0 };
  }

  const total = typeof data === "number" ? data : Number(data) || 0;
  return {
    ok: total <= limit,
    remaining: Math.max(0, limit - total),
    total,
  };
}

/** Check a limit WITHOUT consuming a hit (e.g. before doing expensive work). */
export async function peekLimit(
  scope: string,
  ip: string,
  limit: number,
  windowSec: number,
  extra = ""
): Promise<RateLimitResult> {
  const ipk = sanitize(ip);
  const ex = extra ? `:${sanitize(extra)}` : "";
  const sb = getSupabase();
  const since = new Date(Date.now() - windowSec * 1000).toISOString();
  const { count, error } = await sb
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .like("bucket", `${ipk}:${scope}${ex}:%`)
    .gt("updated_at", since);

  if (error) return { ok: true, remaining: limit, total: 0 };
  const total = count ?? 0;
  return { ok: total <= limit, remaining: Math.max(0, limit - total), total };
}
