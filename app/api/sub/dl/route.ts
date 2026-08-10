// GET /api/sub/dl?id=<uuid>&t=<token>
//
// Serves the stored mihomo YAML behind a 15-minute HMAC-signed token. This is
// the link meant for importing into a client. The token is stateless — verified
// purely from the signature + embedded expiry — but the subscription row must
// still exist and be servable.

import { getClientIP } from "@/lib/http/ip";
import { rateLimit } from "@/lib/ratelimit";
import { verifyToken } from "@/lib/sub/token";
import { getById, incrementDownload, isServable } from "@/lib/sub/db";

export async function GET(request: Request) {
  const ip = getClientIP(request.headers);
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const t = url.searchParams.get("t") ?? "";

  // Light rate limit: 120 downloads / min / IP.
  const rl = await rateLimit("dl", ip, 120, 60);
  if (!rl.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": "30" },
    });
  }

  if (!id || !t) return new Response("Bad request", { status: 400 });

  const v = verifyToken(t);
  if (!v.ok) {
    // badSig / malformed → 403; expired → 410 so clients can prompt to refresh.
    if (v.reason === "expired") {
      return new Response("Token expired. Refresh the link.", { status: 410 });
    }
    return new Response("Forbidden", { status: 403 });
  }
  if (v.id !== id) return new Response("Forbidden", { status: 403 });

  let row;
  try {
    row = await getById(v.id);
  } catch {
    return new Response("Server error", { status: 500 });
  }
  if (!row) return new Response("Not found", { status: 404 });
  if (!isServable(row)) return new Response("Link expired", { status: 410 });

  try {
    await incrementDownload(row.id);
  } catch {
    // Non-fatal: still serve the content.
  }

  return new Response(row.content, {
    status: 200,
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Cache-Control": "no-store",
      // Subscription-Userinfo is honored by many clients; expire echoes token exp.
      "Subscription-Userinfo": `upload=0; download=0; total=0; expire=${v.exp}`,
    },
  });
}
