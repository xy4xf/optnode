// POST /api/sub/token
// Body: { id }
// Returns: { tokenUrl, expiresAt }
//
// Mints a fresh 15-minute download token for an existing subscription, so users
// can keep importing after the previous token expired. Rate-limited per IP.

import { getClientIP } from "@/lib/http/ip";
import { rateLimit } from "@/lib/ratelimit";
import { getById } from "@/lib/sub/db";
import { signToken } from "@/lib/sub/token";
import { getBaseUrl } from "@/lib/supabase/server";

const DEFAULT_TTL = 15;

export async function POST(request: Request) {
  const ip = getClientIP(request.headers);

  // General rate limit: 20 token refreshes / hour / IP.
  const rl = await rateLimit("token", ip, 20, 3600);
  if (!rl.ok) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": "300" } }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  let row;
  try {
    row = await getById(id);
  } catch {
    return Response.json({ error: "Lookup failed" }, { status: 500 });
  }
  // Don't reveal existence: treat missing/expired the same.
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  const { token, exp } = signToken(id, DEFAULT_TTL);
  const base = getBaseUrl();
  return Response.json({
    tokenUrl: `${base}/api/sub/dl?id=${id}&t=${token}`,
    expiresAt: exp * 1000,
  });
}
