import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPublicUrl, isPrivateAddress } from "@/lib/net";

afterEach(() => vi.unstubAllEnvs());

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "%s is private",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "172.32.0.1", "151.101.1.1", "2606:4700::1111"])("%s is public", (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe("assertPublicUrl", () => {
  it("refuses private hosts unless allowed", async () => {
    vi.stubEnv("ALLOW_PRIVATE_NETWORK", "false");
    await expect(assertPublicUrl(new URL("http://169.254.169.254/latest/meta-data"))).rejects.toThrow("private");
    await expect(assertPublicUrl(new URL("http://[::1]:11434/v1"))).rejects.toThrow("private");
    await expect(assertPublicUrl(new URL("file:///etc/passwd"))).rejects.toThrow("http");
    vi.stubEnv("ALLOW_PRIVATE_NETWORK", "true");
    await expect(assertPublicUrl(new URL("http://127.0.0.1:4010/feed"))).resolves.toBeUndefined();
  });
});
