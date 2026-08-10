// POST /api/sub/create
// Body: { input, fullConfig?, appendType?, template?,
//         ttlMins?(<=60, default 15), maxDownloads?, expiresHours? }
// Returns: { id, code, shortUrl, tokenUrl, expiresAt, nodeCount }
//
// Converts pasted nodes to mihomo YAML (reusing the existing convert() core),
// stores it in Supabase under a fresh short code, and returns both a
// persistent short link and a 15-minute HMAC-signed download link. Rate-limited
// per IP to prevent abuse.

import { convert, parseSubscription } from "@/lib/proxy";
import { getClientIP } from "@/lib/http/ip";
import { rateLimit } from "@/lib/ratelimit";
import { createSubscription } from "@/lib/sub/db";
import { signToken } from "@/lib/sub/token";
import { getBaseUrl } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const ip = getClientIP(request.headers);

  // Rate limit: 10 creates / hour / IP.
  const rl = await rateLimit("create", ip, 10, 3600);
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

  const input = typeof body?.input === "string" ? body.input : "";
  if (!input.trim()) {
    return Response.json({ error: "input is required" }, { status: 400 });
  }

  let content: string;
  let nodeCount: number;
  try {
    nodeCount = parseSubscription(input).length;
    if (nodeCount === 0) {
      return Response.json({ error: "No parseable nodes found in input" }, { status: 400 });
    }
    content = convert(input, {
      fullConfig: body?.fullConfig ?? true,
      appendType: body?.appendType ?? false,
      template: body?.template === "minimal" ? "minimal" : "acl4ssr",
    });
  } catch (e: any) {
    return Response.json({ error: `Conversion failed: ${e?.message ?? e}` }, { status: 400 });
  }

  // Optional lifetime caps.
  const maxDownloads =
    Number.isFinite(body?.maxDownloads) && body?.maxDownloads > 0
      ? Math.min(100000, Math.floor(body.maxDownloads))
      : null;
  const expiresHours =
    Number.isFinite(body?.expiresHours) && body?.expiresHours > 0
      ? Math.min(720, Math.floor(body.expiresHours)) // max 30 days
      : null;
  const expires_at = expiresHours
    ? new Date(Date.now() + expiresHours * 3600 * 1000).toISOString()
    : null;

  let row;
  try {
    row = await createSubscription({
      content,
      node_count: nodeCount,
      max_downloads: maxDownloads,
      expires_at,
      creator_ip: ip,
    });
  } catch (e: any) {
    return Response.json({ error: `Failed to store subscription: ${e?.message ?? e}` }, { status: 500 });
  }

  const ttlMins = Number.isFinite(body?.ttlMins) && body?.ttlMins > 0 ? body.ttlMins : 15;
  const { token, exp } = signToken(row.id, ttlMins);
  const base = getBaseUrl();

  return Response.json({
    id: row.id,
    code: row.code,
    nodeCount,
    shortUrl: `${base}/s/${row.code}`,
    tokenUrl: `${base}/api/sub/dl?id=${row.id}&t=${token}`,
    expiresAt: exp * 1000, // ms epoch for the client countdown
  });
}
