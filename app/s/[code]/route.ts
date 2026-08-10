// GET /s/<code>
//
// Persistent short link serving the stored mihomo YAML directly — importable as
// a subscription URL in clients. Optionally password-protected (?pwd= or
// Authorization: Basic). Enumerate-resistant: missing/expired/exceeded all
// return a uniform 404, and lookups are rate-limited per IP.

import { getClientIP } from "@/lib/http/ip";
import { rateLimit } from "@/lib/ratelimit";
import { getByCode, incrementDownload, isServable } from "@/lib/sub/db";
import { verifyPassword } from "@/lib/sub/password";

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
  if (!row || !isServable(row)) return new Response("Not found", { status: 404 });

  if (row.password_hash) {
    const url = new URL(request.url);
    const pwdParam = url.searchParams.get("pwd") ?? "";
    let pwd = pwdParam;
    if (!pwd) {
      const auth = request.headers.get("authorization") ?? "";
      const m = /^Basic\s+(.+)$/i.exec(auth);
      if (m) {
        try {
          const decoded = Buffer.from(m[1], "base64").toString("utf8");
          // username:password — take the password portion.
          pwd = decoded.split(":").slice(1).join(":");
        } catch {
          pwd = "";
        }
      }
    }

    if (!verifyPassword(pwd, row.password_hash)) {
      // Brute-force protection on password attempts: 5 / 10 min / IP+code.
      const bl = await rateLimit("pwd", ip, 5, 600, code);
      if (!bl.ok) {
        return new Response("Too many failed attempts", {
          status: 429,
          headers: { "Retry-After": "600" },
        });
      }
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="optnode"' },
      });
    }
  }

  try {
    await incrementDownload(row.id);
  } catch {
    // Non-fatal.
  }

  const exp = row.expires_at ? Math.floor(new Date(row.expires_at).getTime() / 1000) : 0;
  return new Response(row.content, {
    status: 200,
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Cache-Control": "no-store",
      "Subscription-Userinfo": `upload=0; download=0; total=0${exp ? `; expire=${exp}` : ""}`,
    },
  });
}
