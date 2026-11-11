import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";

// 32 random bytes, URL-safe. Only the hash is stored.
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

// Hex SHA-256, the same value Postgres computes in accept_invitation().
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// Keyed hash, so a stored value cannot be produced without the secret.
export function keyedHash(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}
