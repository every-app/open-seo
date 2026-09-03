import { describe, expect, it, vi } from "vitest";
import { ClarityTokenVault } from "@/server/features/clarity/services/ClarityTokenVault";

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

describe("ClarityTokenVault", () => {
  it("reports when a valid encryption secret is configured", async () => {
    await expect(ClarityTokenVault.isConfigured()).resolves.toBe(true);
  });

  it("round-trips a token without storing it as plaintext", async () => {
    const apiToken = "clarity-api-token-that-must-stay-secret";
    const encrypted = await ClarityTokenVault.encrypt(apiToken);

    expect(encrypted).not.toBe(apiToken);
    expect(encrypted).not.toContain(apiToken);
    await expect(ClarityTokenVault.decrypt(encrypted)).resolves.toBe(apiToken);
  });
});
