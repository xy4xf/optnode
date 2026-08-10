// GET /s/<code>
//
// Persistent short link serving the stored mihomo YAML directly — importable as
// a subscription URL in clients. Enumerate-resistant: missing codes return a
// uniform 404, and lookups are rate-limited per IP.

import { getClientIP } from "@/lib/http/ip";
import { rateLimit } from "@/lib/ratelimit";
import { getByCode, incrementDownload } from "@/lib/sub/db";

export async function GET(request: Request, ctx: RouteContext<"/s/[code]">) {
  const { code } = await ctx.params;
  const ip = getClientIP(request.headers);

  // Enumerate protection: 60 lookups / min / IP.
  const rl = await rateLimit("short", ip, 60, 60);
  if (!rl.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": "30" },
    });
  }

  let row;
  try {
    row = await getByCode(code);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  // Uniform 404 — never reveal whether a code exists.
  if (!row) return new Response("Not found", { status: 404 });

  try {
    await incrementDownload(row.id);
  } catch {
    // Non-fatal.
  }

  return new Response(row.content, {
    status: 200,
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Cache-Control": "no-store",
      "Subscription-Userinfo": "upload=0; download=0; total=0",
    },
  });
}
