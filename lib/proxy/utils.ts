// Utility helpers shared by parsers, ported from subconverter's utils.

/** Decode URL-safe base64, falling back to standard base64. Returns original on failure. */
export function base64Decode(input: string): string {
  let s = input.trim().replace(/\s+/g, "");
  // url-safe -> standard
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  // pad
  while (s.length % 4 !== 0) s += "=";
  try {
    if (typeof atob === "function") {
      const bin = atob(s);
      // decode as UTF-8
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    }
    // node fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const b = require("buffer").Buffer;
    return b.from(s, "base64").toString("utf-8");
  } catch {
    return input;
  }
}

export function isBase64(s: string): boolean {
  return /^[A-Za-z0-9+/_-]+={0,2}$/.test(s.trim().replace(/\s+/g, ""));
}

/** Standard URL component decode (%-encoded). */
export function urlDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function urlEncode(s: string): string {
  return encodeURIComponent(s);
}

export function tribool(v: string | undefined): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const t = v.toLowerCase();
  if (t === "1" || t === "true" || t === "yes" || t === "on") return true;
  if (t === "0" || t === "false" || t === "no" || t === "off") return false;
  return undefined;
}

/** Parse a query string `a=b&c=d` into a map. Last value wins. */
export function parseQuery(query: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!query) return result;
  for (const part of query.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    let key: string;
    let val: string;
    if (eq === -1) {
      key = part;
      val = "";
    } else {
      key = part.slice(0, eq);
      val = part.slice(eq + 1);
    }
    result[urlDecode(key)] = urlDecode(val);
  }
  return result;
}

export function getUrlArg(query: string, key: string): string {
  return parseQuery(query)[key] ?? "";
}

/** alpn may be repeated (alpn=h2&alpn=http/1.1) or comma-joined. */
export function getUrlAlpn(query: string): string {
  const parts: string[] = [];
  for (const part of query.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = urlDecode(part.slice(0, eq));
    if (k === "alpn") parts.push(urlDecode(part.slice(eq + 1)));
  }
  return parts.join(",");
}

export function getUrlAlpnList(query: string): string[] {
  const a = getUrlAlpn(query);
  return a ? a.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

export function toInt(s: string | undefined): number {
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
}

export function isNumeric(s: string): boolean {
  return s !== "" && /^\d+$/.test(s);
}

export function isIPv4(s: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s);
}

export function isIPv6(s: string): boolean {
  return s.includes(":") && !s.includes(".");
}

/** Strip surrounding [ ] from an IPv6 host. */
export function stripBrackets(s: string): string {
  if (s.length > 2 && s[0] === "[" && s[s.length - 1] === "]") return s.slice(1, -1);
  return s;
}

export function trim(s: string): string {
  return s.trim();
}

/** Split the `#remark` (URL-encoded) off the end of a link. Mutates `link` by removing it. */
export function extractRemark(link: { value: string }): string {
  const hash = link.value.indexOf("#");
  if (hash === -1) return "";
  const remark = urlDecode(link.value.slice(hash + 1));
  link.value = link.value.slice(0, hash);
  return remark;
}

export function startsWith(s: string, prefix: string): boolean {
  return s.startsWith(prefix);
}

/** Determine the default host header: use server address when host empty and server is a domain. */
export function defaultHost(host: string, server: string): string {
  if (host) return trim(host);
  if (!isIPv4(server) && !isIPv6(server)) return server;
  return "";
}
