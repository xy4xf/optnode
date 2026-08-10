// Extract the client IP from request headers. Falls back to "unknown".
//
// Prefers the first hop of X-Forwarded-For (the original client when behind a
// proxy / CDN), then X-Real-Ip. Used as the rate-limit key — it does not need
// to be perfect, only stable per source.

export function getClientIP(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
