/* oxlint-disable eslint/complexity */
/* eslint-disable complexity */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));
import {
  resolveEffectiveDataforseoConfig,
  getDataforseoSettingsView,
  saveDataforseoSettings,
  removeDataforseoSettings,
  testDataforseoConnection,
  checkDataforseoApiStatus,
} from "./DataforseoSettingsService";
import { SeoProviderSettingsRepository } from "../repositories/SeoProviderSettingsRepository";
import { encryptDataforseoCredentials } from "../dataforseoCrypto";

const originalKey = process.env.AI_CREDENTIALS_ENCRYPTION_KEY;
const originalLogin = process.env.DATAFORSEO_LOGIN;
const originalPassword = process.env.DATAFORSEO_PASSWORD;
const originalApiKey = process.env.DATAFORSEO_API_KEY;
const originalEnabled = process.env.DATAFORSEO_ENABLED;

beforeEach(() => {
  process.env.AI_CREDENTIALS_ENCRYPTION_KEY =
    "test-secret-key-32-chars-minimum-length!";
  delete process.env.DATAFORSEO_LOGIN;
  delete process.env.DATAFORSEO_PASSWORD;
  delete (process.env as Record<string, string | undefined>).DATAFORSEO_API_KEY;
  delete process.env.DATAFORSEO_ENABLED;
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env.AI_CREDENTIALS_ENCRYPTION_KEY = originalKey;
  if (originalLogin !== undefined) process.env.DATAFORSEO_LOGIN = originalLogin;
  if (originalPassword !== undefined)
    process.env.DATAFORSEO_PASSWORD = originalPassword;
  if (originalApiKey !== undefined)
    process.env.DATAFORSEO_API_KEY = originalApiKey;
  if (originalEnabled !== undefined)
    process.env.DATAFORSEO_ENABLED = originalEnabled;
});

describe("DataforseoSettingsService configuration and persistence", () => {
  describe("resolveEffectiveDataforseoConfig precedence", () => {
    it("returns none when nothing is configured", async () => {
      vi.spyOn(
        SeoProviderSettingsRepository,
        "getOrganizationProviderSettingsRow",
      ).mockResolvedValue(null);
      vi.spyOn(
        SeoProviderSettingsRepository,
        "getProjectProviderSettingsRow",
      ).mockResolvedValue(null);

      const config = await resolveEffectiveDataforseoConfig({
        organizationId: "org-1",
      });
      expect(config).toEqual({
        enabled: false,
        source: "none",
        configured: false,
      });
    });

    it("resolves environment login and password when no DB rows exist", async () => {
      vi.spyOn(
        SeoProviderSettingsRepository,
        "getOrganizationProviderSettingsRow",
      ).mockResolvedValue(null);
      vi.spyOn(
        SeoProviderSettingsRepository,
        "getProjectProviderSettingsRow",
      ).mockResolvedValue(null);

      process.env.DATAFORSEO_LOGIN = "env-user";
      process.env.DATAFORSEO_PASSWORD = "env-password";

      const config = await resolveEffectiveDataforseoConfig({
        organizationId: "org-1",
      });
      expect(config).toEqual({
        enabled: true,
        login: "env-user",
        password: "env-password",
        source: "environment",
        configured: true,
      });
    });

    it("resolves legacy DATAFORSEO_API_KEY base64 format", async () => {
      vi.spyOn(
        SeoProviderSettingsRepository,
        "getOrganizationProviderSettingsRow",
      ).mockResolvedValue(null);

      process.env.DATAFORSEO_API_KEY = Buffer.from(
        "legacy-login:legacy-pass",
      ).toString("base64");

      const config = await resolveEffectiveDataforseoConfig({
        organizationId: "org-1",
      });
      expect(config).toEqual({
        enabled: true,
        login: "legacy-login",
        password: "legacy-pass",
        source: "environment",
        configured: true,
      });
    });

    it("prefers organization row over environment", async () => {
      process.env.DATAFORSEO_LOGIN = "env-user";
      process.env.DATAFORSEO_PASSWORD = "env-password";

      const orgCipher = await encryptDataforseoCredentials({
        login: "org-user",
        password: "org-password",
      });

      vi.spyOn(
        SeoProviderSettingsRepository,
        "getOrganizationProviderSettingsRow",
      ).mockResolvedValue({
        provider: "dataforseo",
        enabled: true,
        credentialsCiphertext: orgCipher,
        organizationId: "org-1",
        projectId: null,
        updatedAt: new Date().toISOString(),
      });
      vi.spyOn(
        SeoProviderSettingsRepository,
        "getProjectProviderSettingsRow",
      ).mockResolvedValue(null);

      const config = await resolveEffectiveDataforseoConfig({
        organizationId: "org-1",
      });
      expect(config).toEqual({
        enabled: true,
        login: "org-user",
        password: "org-password",
        source: "organization",
        configured: true,
      });
    });

    it("prefers project row over organization row", async () => {
      const orgCipher = await encryptDataforseoCredentials({
        login: "org-user",
        password: "org-password",
      });
      const projCipher = await encryptDataforseoCredentials({
        login: "proj-user",
        password: "proj-password",
      });

      vi.spyOn(
        SeoProviderSettingsRepository,
        "getOrganizationProviderSettingsRow",
      ).mockResolvedValue({
        provider: "dataforseo",
        enabled: true,
        credentialsCiphertext: orgCipher,
        organizationId: "org-1",
        projectId: null,
        updatedAt: new Date().toISOString(),
      });

      vi.spyOn(
        SeoProviderSettingsRepository,
        "getProjectProviderSettingsRow",
      ).mockResolvedValue({
        provider: "dataforseo",
        enabled: true,
        credentialsCiphertext: projCipher,
        organizationId: null,
        projectId: "proj-1",
        updatedAt: new Date().toISOString(),
      });

      const config = await resolveEffectiveDataforseoConfig({
        organizationId: "org-1",
        projectId: "proj-1",
      });
      expect(config).toEqual({
        enabled: true,
        login: "proj-user",
        password: "proj-password",
        source: "project",
        configured: true,
      });
    });
  });

  describe("getDataforseoSettingsView", () => {
    it("returns masked login and never returns plaintext password", async () => {
      const orgCipher = await encryptDataforseoCredentials({
        login: "my-account-4f2a",
        password: "super-secret-password",
      });

      vi.spyOn(
        SeoProviderSettingsRepository,
        "getOrganizationProviderSettingsRow",
      ).mockResolvedValue({
        provider: "dataforseo",
        enabled: true,
        credentialsCiphertext: orgCipher,
        organizationId: "org-1",
        projectId: null,
        updatedAt: new Date().toISOString(),
      });

      const view = await getDataforseoSettingsView({ organizationId: "org-1" });
      expect(view.configured).toBe(true);
      expect(view.enabled).toBe(true);
      expect(view.source).toBe("organization");
      expect(view.loginMasked).toBe("********4f2a");
      expect(view.passwordConfigured).toBe(true);
      // Ensure password does not exist anywhere on the returned object
      expect(JSON.stringify(view)).not.toContain("super-secret-password");
      expect("password" in view).toBe(false);
    });
  });

  describe("saveDataforseoSettings", () => {
    it("requires both login and password on first setup", async () => {
      vi.spyOn(
        SeoProviderSettingsRepository,
        "getOrganizationProviderSettingsRow",
      ).mockResolvedValue(null);

      await expect(
        saveDataforseoSettings({
          organizationId: "org-1",
          patch: { login: "only-login" },
        }),
      ).rejects.toThrow("Both API Login and API Password are required");
    });

    it("saves credentials and persists encrypted ciphertext", async () => {
      vi.spyOn(
        SeoProviderSettingsRepository,
        "getOrganizationProviderSettingsRow",
      ).mockResolvedValue(null);
      const upsertSpy = vi
        .spyOn(
          SeoProviderSettingsRepository,
          "upsertOrganizationProviderSettingsRow",
        )
        .mockResolvedValue();

      await saveDataforseoSettings({
        organizationId: "org-1",
        patch: {
          login: "new-user@domain.com",
          password: "new-password",
          enabled: true,
        },
      });

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      const [orgId, provider, input] = upsertSpy.mock.calls[0];
      expect(orgId).toBe("org-1");
      expect(provider).toBe("dataforseo");
      expect(input.enabled).toBe(true);
      expect(input.credentialsCiphertext).toBeTypeOf("string");
      expect(input.credentialsCiphertext).not.toContain("new-password");
    });

    it("preserves existing password when updating login only", async () => {
      const existingCipher = await encryptDataforseoCredentials({
        login: "old-user",
        password: "preserved-secret",
      });

      vi.spyOn(
        SeoProviderSettingsRepository,
        "getOrganizationProviderSettingsRow",
      ).mockResolvedValue({
        provider: "dataforseo",
        enabled: true,
        credentialsCiphertext: existingCipher,
        organizationId: "org-1",
        projectId: null,
        updatedAt: new Date().toISOString(),
      });

      const upsertSpy = vi
        .spyOn(
          SeoProviderSettingsRepository,
          "upsertOrganizationProviderSettingsRow",
        )
        .mockResolvedValue();

      await saveDataforseoSettings({
        organizationId: "org-1",
        patch: {
          login: "updated-user",
        },
      });

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      const input = upsertSpy.mock.calls[0][2];
      expect(input.credentialsCiphertext).toBeTypeOf("string");
      // Decrypt to verify preserved password
      const decrypted = await (
        await import("../dataforseoCrypto")
      ).decryptDataforseoCredentials(input.credentialsCiphertext);
      expect(decrypted).toEqual({
        login: "updated-user",
        password: "preserved-secret",
      });
    });
  });

  describe("removeDataforseoSettings", () => {
    it("deletes organization row and reveals environment config", async () => {
      process.env.DATAFORSEO_LOGIN = "env-user";
      process.env.DATAFORSEO_PASSWORD = "env-pass";

      const deleteSpy = vi
        .spyOn(
          SeoProviderSettingsRepository,
          "deleteOrganizationProviderSettings",
        )
        .mockResolvedValue();
      vi.spyOn(
        SeoProviderSettingsRepository,
        "getOrganizationProviderSettingsRow",
      ).mockResolvedValue(null);

      const result = await removeDataforseoSettings({
        organizationId: "org-1",
      });
      expect(deleteSpy).toHaveBeenCalledWith("org-1", "dataforseo");
      expect(result.source).toBe("environment");
      expect(result.configured).toBe(true);
    });
  });
});

describe("DataforseoSettingsService testDataforseoConnection", () => {
  it("successfully connects and extracts balance from /v3/appendix/user_data", async () => {
    const mockFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            status_code: 20000,
            tasks: [
              {
                status_code: 20000,
                result: [
                  {
                    money: {
                      balance: 14.52,
                      total: 100.0,
                    },
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
    );

    const result = await testDataforseoConnection({
      organizationId: "org-1",
      login: "test-login",
      password: "test-password",
      fetchFn: mockFetch,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0];
    const url = call[0];
    const init = call[1];
    expect(url).toBe("https://api.dataforseo.com/v3/appendix/user_data");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe(
      `Basic ${Buffer.from("test-login:test-password").toString("base64")}`,
    );

    expect(result).toEqual({
      ok: true,
      status: 200,
      reason: "CONNECTED",
      balance: 14.52,
      billingStatus: "credits_available",
    });
  });

  it("normalizes 401 unauthorized to INVALID_CREDENTIALS", async () => {
    const mockFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ status_code: 40100 }), { status: 401 }),
    );

    const result = await testDataforseoConnection({
      organizationId: "org-1",
      login: "wrong-user",
      password: "wrong-password",
      fetchFn: mockFetch,
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      reason: "INVALID_CREDENTIALS",
      billingStatus: "unknown",
    });
  });

  it("normalizes 402 payment required to CREDITS_UNAVAILABLE", async () => {
    const mockFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ status_code: 40200 }), { status: 402 }),
    );

    const result = await testDataforseoConnection({
      organizationId: "org-1",
      login: "no-credits",
      password: "pass",
      fetchFn: mockFetch,
    });

    expect(result).toEqual({
      ok: false,
      status: 402,
      reason: "CREDITS_UNAVAILABLE",
      billingStatus: "credits_unavailable",
    });
  });

  it("normalizes 429 rate limit to RATE_LIMITED", async () => {
    const mockFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ status_code: 42900 }), { status: 429 }),
    );

    const result = await testDataforseoConnection({
      organizationId: "org-1",
      login: "busy-user",
      password: "pass",
      fetchFn: mockFetch,
    });

    expect(result).toEqual({
      ok: false,
      status: 429,
      reason: "RATE_LIMITED",
      billingStatus: "unknown",
    });
  });

  it("normalizes 500+ server error to TRANSIENT_UPSTREAM", async () => {
    const mockFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ status_code: 50300 }), { status: 503 }),
    );

    const result = await testDataforseoConnection({
      organizationId: "org-1",
      login: "user",
      password: "pass",
      fetchFn: mockFetch,
    });

    expect(result).toEqual({
      ok: false,
      status: 503,
      reason: "TRANSIENT_UPSTREAM",
      billingStatus: "unknown",
    });
  });

  it("handles network failure safely without throwing", async () => {
    const mockFetch = vi.fn<typeof fetch>(async () => {
      throw new Error("ENOTFOUND");
    });

    const result = await testDataforseoConnection({
      organizationId: "org-1",
      login: "user",
      password: "pass",
      fetchFn: mockFetch,
    });

    expect(result).toEqual({
      ok: false,
      status: 503,
      reason: "TRANSIENT_UPSTREAM",
      billingStatus: "unknown",
    });
  });
});

describe("DataforseoSettingsService checkDataforseoApiStatus", () => {
  it("successfully connects and returns API endpoints from /v3/appendix/status", async () => {
    const mockPayload = {
      version: "0.1.20260902",
      status_code: 20000,
      status_message: "Ok.",
      time: "0.1 sec.",
      cost: 0,
      tasks_count: 1,
      tasks_error: 0,
      tasks: [
        {
          id: "task-1",
          status_code: 20000,
          status_message: "Ok.",
          time: "0.05 sec.",
          cost: 0,
          result_count: 2,
          path: ["v3", "appendix", "status"],
          data: { api: "appendix", function: "status" },
          result: [
            {
              api: "serp",
              status: "ok",
              endpoints: [
                { endpoint: "live", status: "ok" },
                { endpoint: "task_post", status: "ok" },
              ],
            },
            {
              api: "keywords_data",
              status: "ok",
              endpoints: null,
            },
          ],
        },
      ],
    };

    const mockFetch = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(mockPayload), { status: 200 }),
    );

    const result = await checkDataforseoApiStatus({
      organizationId: "org-1",
      login: "test-login",
      password: "test-password",
      fetchFn: mockFetch,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0];
    const url = call[0];
    const init = call[1];
    expect(url).toBe("https://api.dataforseo.com/v3/appendix/status");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe(
      `Basic ${Buffer.from("test-login:test-password").toString("base64")}`,
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.reason).toBe("CONNECTED");
    expect(result.endpoints).toHaveLength(2);
    expect(result.endpoints[0]).toEqual({
      api: "serp",
      status: "ok",
      endpoints: [
        { endpoint: "live", status: "ok" },
        { endpoint: "task_post", status: "ok" },
      ],
    });
    expect(result.endpoints[1]).toEqual({
      api: "keywords_data",
      status: "ok",
      endpoints: null,
    });
    expect(result.checkedAt).toBeDefined();
  });

  it("returns NOT_CONFIGURED when no credentials are present", async () => {
    vi.spyOn(
      SeoProviderSettingsRepository,
      "getOrganizationProviderSettingsRow",
    ).mockResolvedValue(null);
    vi.spyOn(
      SeoProviderSettingsRepository,
      "getProjectProviderSettingsRow",
    ).mockResolvedValue(null);

    const result = await checkDataforseoApiStatus({
      organizationId: "org-1",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.reason).toBe("NOT_CONFIGURED");
    expect(result.endpoints).toEqual([]);
  });

  it("normalizes 401 unauthorized to INVALID_CREDENTIALS", async () => {
    const mockFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ status_code: 40100 }), { status: 401 }),
    );

    const result = await checkDataforseoApiStatus({
      organizationId: "org-1",
      login: "bad-user",
      password: "bad-password",
      fetchFn: mockFetch,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.reason).toBe("INVALID_CREDENTIALS");
    expect(result.endpoints).toEqual([]);
  });

  it("normalizes 429 rate limit to RATE_LIMITED", async () => {
    const mockFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ status_code: 42900 }), { status: 429 }),
    );

    const result = await checkDataforseoApiStatus({
      organizationId: "org-1",
      login: "rate-limited-user",
      password: "pass",
      fetchFn: mockFetch,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
    expect(result.reason).toBe("RATE_LIMITED");
    expect(result.endpoints).toEqual([]);
  });

  it("normalizes 500+ server error to TRANSIENT_UPSTREAM", async () => {
    const mockFetch = vi.fn<typeof fetch>(
      async () => new Response("Gateway Timeout", { status: 504 }),
    );

    const result = await checkDataforseoApiStatus({
      organizationId: "org-1",
      login: "user",
      password: "pass",
      fetchFn: mockFetch,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(504);
    expect(result.reason).toBe("TRANSIENT_UPSTREAM");
    expect(result.endpoints).toEqual([]);
  });

  it("handles network failure safely without throwing", async () => {
    const mockFetch = vi.fn<typeof fetch>(async () => {
      throw new Error("Fetch failed");
    });

    const result = await checkDataforseoApiStatus({
      organizationId: "org-1",
      login: "user",
      password: "pass",
      fetchFn: mockFetch,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.reason).toBe("TRANSIENT_UPSTREAM");
    expect(result.endpoints).toEqual([]);
  });
});
