import { describe, expect, it, vi } from "vitest";
import { CloudflareCredentialVault } from "./CloudflareCredentialVault";

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    $context: Promise.resolve({
      secretConfig: "test-secret-at-least-32-characters",
    }),
  }),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async () => "x".repeat(32),
}));

describe("CloudflareCredentialVault", () => {
  it("requires a valid deployment encryption secret", async () => {
    await expect(CloudflareCredentialVault.isConfigured()).resolves.toBe(true);
  });

  it("round-trips a token without retaining plaintext", async () => {
    const token = "cloudflare-read-only-token-that-must-remain-secret";
    const encrypted = await CloudflareCredentialVault.encrypt(token);

    expect(encrypted).not.toBe(token);
    expect(encrypted).not.toContain(token);
    await expect(CloudflareCredentialVault.decrypt(encrypted)).resolves.toBe(
      token,
    );
  });
});
