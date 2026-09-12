import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  encryptDataforseoCredentials,
  decryptDataforseoCredentials,
  maskDataforseoLogin,
} from "./dataforseoCrypto";
import {
  saveDataforseoSettings,
  getDataforseoSettingsView,
  testDataforseoConnection,
} from "./services/DataforseoSettingsService";
import { SeoProviderSettingsRepository } from "./repositories/SeoProviderSettingsRepository";

describe("DataForSEO Security Invariants", () => {
  const originalKey = process.env.AI_CREDENTIALS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY =
      "test-secret-key-32-chars-minimum-length!";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = originalKey;
  });

  it("ensures credentials are encrypted at rest and never stored in plaintext", async () => {
    const rawSecret = "super-secret-unmasked-api-password-12345";
    const rawLogin = "alice@example.com";

    const encrypted = await encryptDataforseoCredentials({
      login: rawLogin,
      password: rawSecret,
    });

    expect(encrypted).not.toBeNull();
    expect(encrypted).not.toContain(rawSecret);
    expect(encrypted).not.toContain(rawLogin);

    // Persist via service
    vi.spyOn(
      SeoProviderSettingsRepository,
      "getOrganizationProviderSettingsRow",
    ).mockResolvedValue(null);
    const upsertSpy = vi.spyOn(
      SeoProviderSettingsRepository,
      "upsertOrganizationProviderSettingsRow",
    ).mockResolvedValue();

    await saveDataforseoSettings({
      organizationId: "org-sec-1",
      patch: {
        login: rawLogin,
        password: rawSecret,
      },
    });

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const callArg = upsertSpy.mock.calls[0]?.[2];
    expect(callArg).toBeDefined();
    if (!callArg) return;

    // Check payload passed to DB repository
    expect(callArg.credentialsCiphertext).not.toContain(rawSecret);
    expect(callArg.credentialsCiphertext).not.toContain(rawLogin);
    expect(callArg.credentialsCiphertext).toMatch(/^[\w+/=-]+$/); // base64 AES-GCM ciphertext
  });

  it("ensures getDataforseoSettingsView never returns plaintext password or raw login", async () => {
    const rawSecret = "very-secret-password-xyz";
    const rawLogin = "security-admin@example.com";

    const encrypted = await encryptDataforseoCredentials({
      login: rawLogin,
      password: rawSecret,
    });

    vi.spyOn(
      SeoProviderSettingsRepository,
      "getOrganizationProviderSettingsRow",
    ).mockResolvedValue({
      provider: "dataforseo",
      organizationId: "org-sec-2",
      projectId: null,
      enabled: true,
      credentialsCiphertext: encrypted,
      updatedAt: new Date().toISOString(),
    });

    const view = await getDataforseoSettingsView({ organizationId: "org-sec-2" });

    // Stringify view to ensure no secret exists anywhere in the JSON tree
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(rawSecret);
    expect(serialized).not.toContain(rawLogin);

    // Check structure
    expect(view.passwordConfigured).toBe(true);
    expect(view.loginMasked).toBe(maskDataforseoLogin(rawLogin));
    expect(view).not.toHaveProperty("password");
    expect(view).not.toHaveProperty("apiKey");
    if (view.override) {
      expect(view.override).not.toHaveProperty("password");
    }
  });

  it("ensures testDataforseoConnection never leaks secrets in result or logs", async () => {
    const rawSecret = "confidential-pass-999";
    const rawLogin = "test-user@company.com";

    const mockFetch = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          status_code: 20000,
          tasks: [{ status_code: 20000, result: [{ money: { balance: 5.5 } }] }],
        }),
        { status: 200 },
      ),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await testDataforseoConnection({
      organizationId: "org-sec-3",
      login: rawLogin,
      password: rawSecret,
      fetchFn: mockFetch,
    });

    // Check return value
    const resultJson = JSON.stringify(result);
    expect(resultJson).not.toContain(rawSecret);
    expect(resultJson).not.toContain(rawLogin);
    expect(resultJson).not.toContain("Basic");
    expect(result.ok).toBe(true);

    // Check all logged output
    for (const call of logSpy.mock.calls) {
      const logText = JSON.stringify(call);
      expect(logText).not.toContain(rawSecret);
      expect(logText).not.toContain(rawLogin);
      expect(logText).not.toContain("Basic ");
    }
  });

  it("ensures decryption with wrong key fails safely without throwing or leaking", async () => {
    const rawSecret = "password-for-key-1";
    const encrypted = await encryptDataforseoCredentials({
      login: "login-1",
      password: rawSecret,
    });

    // Switch to different encryption key
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY =
      "different-secret-key-32-chars-long!!";

    const decrypted = await decryptDataforseoCredentials(encrypted);
    expect(decrypted).toBeNull();
  });
});
