import { describe, expect, it, vi } from "vitest";

vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret");
const { decrypt, encrypt } = await import("@/lib/crypto");

describe("crypto", () => {
  it("round-trips and doesn't leak the plaintext", () => {
    const sealed = encrypt("sk-ant-123");
    expect(sealed).not.toContain("sk-ant-123");
    expect(decrypt(sealed)).toBe("sk-ant-123");
    expect(encrypt("sk-ant-123")).not.toBe(sealed);
  });

  it("rejects tampered values", () => {
    const [v, iv, tag, data] = encrypt("secret").split(".");
    expect(() => decrypt([v, iv, tag, data.slice(0, -2) + "AA"].join("."))).toThrow();
  });
});
