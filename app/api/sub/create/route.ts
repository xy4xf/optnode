// POST /api/sub/create
// Body: { input, fullConfig?, appendType?, template? }
// Returns: { code, shortUrl, nodeCount }
//
// Converts pasted nodes to mihomo YAML (reusing the existing convert() core),
// stores it in Supabase under a fresh short code, and returns a persistent
// short link that can be imported directly as a subscription URL. Rate-limited
// per IP to prevent abuse.

import { convert, parseSubscription } from "@/lib/proxy";
import { getClientIP } from "@/lib/http/ip";
import { rateLimit } from "@/lib/ratelimit";
import { createSubscription } from "@/lib/sub/db";
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

  let row;
  try {
    row = await createSubscription({ content, node_count: nodeCount, creator_ip: ip });
  } catch (e: any) {
    return Response.json({ error: `Failed to store subscription: ${e?.message ?? e}` }, { status: 500 });
  }

  const base = getBaseUrl();
  return Response.json({
    code: row.code,
    nodeCount,
    shortUrl: `${base}/s/${row.code}`,
  });
}
