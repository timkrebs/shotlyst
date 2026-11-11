import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { generateToken, hashToken, keyedHash } = await import("./tokens");

describe("tokens", () => {
  it("generates 32 random bytes as a URL-safe string", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(token);
  });

  it("hashes with hex SHA-256", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("derives different keyed hashes for different secrets", () => {
    expect(keyedHash("203.0.113.7", "a")).not.toBe(keyedHash("203.0.113.7", "b"));
    expect(keyedHash("203.0.113.7", "a")).toBe(keyedHash("203.0.113.7", "a"));
  });
});
