// Optional subscription password protection — scrypt-based, no extra deps.
//
// Format: `scrypt$saltHex$NHex$rlenHex$hashHex`. scrypt (high N) deliberately
// slows each guess, complementing the per-IP rate limit on password attempts.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384; // CPU/memory cost
const R = 8;
const P = 1;
const SALT_LEN = 16;
const KEY_LEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN);
  const hash = scryptSync(password, salt, KEY_LEN, { N, r: R, p: P });
  return `scrypt$${salt.toString("hex")}$${N.toString(16)}$${KEY_LEN.toString(16)}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "scrypt") return false;
  const [, saltHex, nHex, klenHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const N_ = parseInt(nHex, 16);
  const klen = parseInt(klenHex, 16);
  const expected = Buffer.from(hashHex, "hex");
  try {
    const hash = scryptSync(password, salt, klen, { N: N_, r: R, p: P });
    return hash.length === expected.length && timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}
