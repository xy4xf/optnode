// Short-code generation for subscription links.
//
// Uses a Crockford-like base32 alphabet (no 0/O/1/I/L ambiguity) so codes are
// safe to type and read. 10 characters ≈ 50 bits of entropy — unguessable in
// practice, which is the primary defense against short-code enumeration.

import { randomBytes } from "node:crypto";

// 31 chars: digits 2-9 + letters minus i/l/o (no ambiguous 0/O/1/I/L).
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const CODE_LEN = 10;

export function generateCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    // Modulo by the actual alphabet length — never an out-of-range index.
    // The tiny modulo bias on a 31-symbol alphabet is cryptographically
    // irrelevant here (49-bit codes, 60/min rate limit on enumeration).
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
