// Stateless HMAC-SHA256 signed download tokens.
//
// A token encodes `{ id, exp }` and a signature over them using
// SUB_LINK_SECRET. This makes the 15-minute download link verifiable without a
// database lookup for the signature itself (the row is still fetched to serve
// content). Tokens cannot be forged without the secret and cannot be extended
// past their embedded expiry.

import { createHmac, timingSafeEqual } from "node:crypto";

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function secret(): string {
  const s = process.env.SUB_LINK_SECRET;
  if (!s) throw new Error("SUB_LINK_SECRET is not set in .env");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export interface SignedToken {
  id: string;
  exp: number; // unix seconds
}

/** Build a token valid for `expMins` minutes (default 15, hard cap 60). */
export function signToken(id: string, expMins = 15): { token: string; exp: number } {
  const mins = Math.max(1, Math.min(60, Math.floor(expMins)));
  const exp = Math.floor(Date.now() / 1000) + mins * 60;
  const payload = b64url(JSON.stringify({ id, exp }));
  return { token: `${payload}.${sign(`${payload}.${exp}`)}`, exp };
}

export type VerifyResult =
  | { ok: true; id: string; exp: number }
  | { ok: false; reason: "malformed" | "badSig" | "expired" };

export function verifyToken(token: string): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };

  const [payload, sig] = parts;
  let parsed: SignedToken;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof parsed.id !== "string" || typeof parsed.exp !== "number") {
    return { ok: false, reason: "malformed" };
  }

  const expected = sign(`${payload}.${parsed.exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "badSig" };
  }

  if (parsed.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, id: parsed.id, exp: parsed.exp };
}
