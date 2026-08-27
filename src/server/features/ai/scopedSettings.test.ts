import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Repo from "./AiSettingsRepository";
import {
  getScopeAiSettingsView,
  saveScopeAiSettings,
} from "./scopedSettings";
import { decryptCredentialMap } from "./credentialCrypto";
import type { AiAgentSettingsRow } from "./AiSettingsRepository";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: (key: string) =>
    key === "BETTER_AUTH_SECRET"
      ? "test-secret-value-at-least-32-chars-long"
      : undefined,
}));

// In-memory stand-in for the settings table: the repository is the seam, so
// the orchestration (encrypt-on-write, decrypt-on-read, masking-on-view) is
// exercised end-to-end without a database.
const rows: {
  org: Record<string, AiAgentSettingsRow>;
  project: Record<string, AiAgentSettingsRow>;
} = { org: {}, project: {} };

vi.mock("./AiSettingsRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof Repo>();
  return {
    ...actual,
    AiSettingsRepository: {
      ...actual.AiSettingsRepository,
      getOrganizationAiSettingsRow: async (organizationId: string) =>
        rows.org[organizationId] ?? null,
      getProjectAiSettingsRow: async (projectId: string) =>
        rows.project[projectId] ?? null,
      upsertOrganizationAiSettingsRow: async (
        organizationId: string,
        input: { provider: string; model: string | null; baseUrl: string | null },
        ciphertext: string | null,
      ) => {
        rows.org[organizationId] = {
          provider: input.provider,
          model: input.model,
          baseUrl: input.baseUrl,
          credentialsCiphertext: ciphertext,
        };
      },
      upsertProjectAiSettingsRow: async (
        projectId: string,
        input: { provider: string; model: string | null; baseUrl: string | null },
        ciphertext: string | null,
      ) => {
        rows.project[projectId] = {
          provider: input.provider,
          model: input.model,
          baseUrl: input.baseUrl,
          credentialsCiphertext: ciphertext,
        };
      },
      deleteProjectAiSettings: async (projectId: string) => {
        delete rows.project[projectId];
      },
      deleteOrganizationAiSettings: async (organizationId: string) => {
        delete rows.org[organizationId];
      },
    },
  };
});

const ORG = "org-1";
const PROJECT_A = "proj-a";
const PROJECT_B = "proj-b";

const emptyEnv = {
  aiAgentProvider: null,
  aiAgentModel: null,
  providerModelDefaults: {},
  apiKeys: {},
  baseUrls: {},
};

beforeEach(() => {
  rows.org = {};
  rows.project = {};
});

describe("saveScopeAiSettings â€” encrypted credential persistence (S5/S7)", () => {
  it("stores the API key ENCRYPTED (ciphertext, never plaintext) and merges per provider", async () => {
    const save = await saveScopeAiSettings({
      scope: "organization",
      organizationId: ORG,
      patch: { provider: "openai", apiKey: "sk-openai-plain-1234" },
    });
    expect(save).toMatchObject({ ok: true, provider: "openai" });

    const row = rows.org[ORG];
    expect(row.credentialsCiphertext).toBeTruthy();
    expect(row.credentialsCiphertext).not.toContain("sk-openai-plain");
    // Decryptable only through the credential crypto path:
    const map = await decryptCredentialMap(row.credentialsCiphertext);
    expect(map).toEqual({ openai: "sk-openai-plain-1234" });

    // A second save for ANOTHER provider merges â€” the openai key survives.
    await saveScopeAiSettings({
      scope: "organization",
      organizationId: ORG,
      patch: { provider: "gemini", apiKey: "gemini-key-9999" },
    });
    const merged = await decryptCredentialMap(
      rows.org[ORG].credentialsCiphertext,
    );
    expect(merged).toEqual({
      openai: "sk-openai-plain-1234",
      gemini: "gemini-key-9999",
    });
  });

  it("removes a stored credential override without touching other providers", async () => {
    await saveScopeAiSettings({
      scope: "project",
      organizationId: ORG,
      projectId: PROJECT_A,
      patch: { provider: "openai", apiKey: "k1" },
    });
    await saveScopeAiSettings({
      scope: "project",
      organizationId: ORG,
      projectId: PROJECT_A,
      patch: { provider: "gemini", apiKey: "k2" },
    });
    await saveScopeAiSettings({
      scope: "project",
      organizationId: ORG,
      projectId: PROJECT_A,
      patch: { provider: "openai", apiKey: null },
    });
    const map = await decryptCredentialMap(
      rows.project[PROJECT_A].credentialsCiphertext,
    );
    expect(map).toEqual({ gemini: "k2" });
  });

  it("rejects unsafe Base URLs (hosted SSRF rules) and invalid pairs", async () => {
    const bad = await saveScopeAiSettings({
      scope: "organization",
      organizationId: ORG,
      patch: { provider: "openai_compatible", baseUrl: "http://127.0.0.1:11434/v1" },
    });
    expect(bad).toMatchObject({ ok: false });

    const badPair = await saveScopeAiSettings({
      scope: "organization",
      organizationId: ORG,
      patch: { provider: "anthropic", model: "gemini-2.5-flash" },
    });
    expect(badPair).toMatchObject({ ok: false });
  });

  it("reset deletes the scope row entirely (S23)", async () => {
    await saveScopeAiSettings({
      scope: "project",
      organizationId: ORG,
      projectId: PROJECT_A,
      patch: { provider: "openai", model: "gpt-5", apiKey: "k" },
    });
    await saveScopeAiSettings({
      scope: "project",
      organizationId: ORG,
      projectId: PROJECT_A,
      patch: { resetToInherited: true },
    });
    expect(rows.project[PROJECT_A]).toBeUndefined();
  });
});

describe("getScopeAiSettingsView â€” masking + isolation (S9/S13/S30)", () => {
  it("never returns plaintext keys; shows masked stored credentials + source", async () => {
    await saveScopeAiSettings({
      scope: "organization",
      organizationId: ORG,
      patch: { provider: "openrouter", apiKey: "sk-or-v1-supersecret9999" },
    });
    const view = await getScopeAiSettingsView({
      scope: "organization",
      organizationId: ORG,
      env: emptyEnv,
    });
    const raw = JSON.stringify(view);
    expect(raw).not.toContain("sk-or-v1-supersecret");
    expect(view.override?.credentials.openrouter).toMatchObject({ stored: true });
    expect(view.override?.credentials.openrouter.masked).toMatch(/••••/);
    expect(view.effective.credentialConfigured).toBe(true);
    expect(view.effective.credentialMasked).toMatch(/••••/);
  });

  it("project override beats organization; other projects stay isolated", async () => {
    await saveScopeAiSettings({
      scope: "organization",
      organizationId: ORG,
      patch: { provider: "openrouter", model: "org/model" },
    });
    await saveScopeAiSettings({
      scope: "project",
      organizationId: ORG,
      projectId: PROJECT_A,
      patch: { provider: "openai", model: "gpt-5", apiKey: "proj-key-a" },
    });
    // A different project with NO override inherits the organization row.
    await saveScopeAiSettings({
      scope: "project",
      organizationId: ORG,
      projectId: PROJECT_B,
      patch: { provider: "openrouter", model: null },
    });
    const viewA = await getScopeAiSettingsView({
      scope: "project",
      organizationId: ORG,
      projectId: PROJECT_A,
      env: emptyEnv,
    });
    const viewB = await getScopeAiSettingsView({
      scope: "project",
      organizationId: ORG,
      projectId: "proj-b",
      env: emptyEnv,
    });
    expect(viewA.effective.provider).toBe("openai");
    expect(viewA.effective.model).toBe("gpt-5");
    expect(viewA.effective.credentialSource).toBe("project");
    // proj-b inherits the organization configuration:
    expect(viewB.effective.provider).toBe("openrouter");
    expect(viewB.effective.model).toBe("org/model");
    expect(viewB.effective.credentialSource).toBe("none");
  });

  it("reset restores inheritance to the organization row (S23)", async () => {
    await saveScopeAiSettings({
      scope: "organization",
      organizationId: ORG,
      patch: { provider: "gemini", model: "gemini-2.5-flash" },
    });
    await saveScopeAiSettings({
      scope: "project",
      organizationId: ORG,
      projectId: PROJECT_A,
      patch: { provider: "openai", model: "gpt-5" },
    });
    await saveScopeAiSettings({
      scope: "project",
      organizationId: ORG,
      projectId: PROJECT_A,
      patch: { resetToInherited: true },
    });
    const view = await getScopeAiSettingsView({
      scope: "project",
      organizationId: ORG,
      projectId: PROJECT_A,
      env: emptyEnv,
    });
    expect(view.override).toBeNull();
    expect(view.effective.provider).toBe("gemini");
    expect(view.effective.model).toBe("gemini-2.5-flash");
  });

  it("env credential fills in when nothing is stored for the provider", async () => {
    const view = await getScopeAiSettingsView({
      scope: "organization",
      organizationId: ORG,
      env: {
        ...emptyEnv,
        aiAgentProvider: "openrouter",
        apiKeys: { openrouter: "sk-or-v1-envkey-abcd9999" },
      },
    });
    expect(view.effective.credentialSource).toBe("environment");
    expect(view.effective.credentialConfigured).toBe(true);
    expect(JSON.stringify(view)).not.toContain("sk-or-v1-envkey-abcd9999");
    expect(view.effective.credentialMasked).toMatch(/••••/);
  });
});