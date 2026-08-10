// Short-code generation for subscription links.
//
// Uses a Crockford-like base32 alphabet (no 0/O/1/I/L ambiguity) so codes are
// safe to type and read. 10 characters ≈ 50 bits of entropy — unguessable in
// practice, which is the primary defense against short-code enumeration.

import { randomBytes } from "node:crypto";

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"; // 32 chars, no ambiguous
const CODE_LEN = 10;

export function generateCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[bytes[i] % 32];
  }
  return out;
}
