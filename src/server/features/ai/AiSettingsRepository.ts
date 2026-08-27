import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiAgentSettings } from "@/db/schema";

// Per-scope AI configuration for the in-app agent (Phase S): provider, model,
// endpoint Base URL override, and an encrypted credential map. Rows are either
// organization-scoped (global default) or project-scoped (override); the
// repository enforces "exactly one scope per row".
//
// `credentials` is an encrypted JSON map { [providerId]: apiKey } (better-auth
// AES-GCM envelope — see credentialCrypto.ts). This layer never encrypts or
// decrypts: callers pass ciphertext in and read ciphertext out, so no
// plaintext key is ever a repository concern. `baseUrl` is plaintext
// configuration data (not a secret) and is only honored when the row's
// provider matches the effective provider.
//
// A null/empty model means "inherit": project row -> organization row ->
// environment default.

export type AiAgentSettingsInput = {
  provider: string;
  model: string | null;
  baseUrl?: string | null;
  /** Encrypted credential-map ciphertext; undefined = leave unchanged. */
  credentialsCiphertext?: string | null;
};

export type AiAgentSettingsRow = {
  provider: string;
  model: string | null;
  baseUrl: string | null;
  /** Encrypted map — decrypt via credentialCrypto at the service layer. */
  credentialsCiphertext: string | null;
};

function normalizeModel(model: string | null | undefined): string | null {
  const trimmed = model?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBaseUrl(baseUrl: string | null | undefined): string | null {
  const trimmed = baseUrl?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

const ROW_COLUMNS = {
  provider: aiAgentSettings.provider,
  model: aiAgentSettings.model,
  baseUrl: aiAgentSettings.baseUrl,
  credentialsCiphertext: aiAgentSettings.credentials,
};

type RawRow = {
  provider: string;
  model: string | null;
  baseUrl: string | null;
  credentialsCiphertext: string | null;
};

function toRow(raw: RawRow): AiAgentSettingsRow {
  return {
    provider: raw.provider,
    model: normalizeModel(raw.model),
    baseUrl: normalizeBaseUrl(raw.baseUrl),
    credentialsCiphertext: raw.credentialsCiphertext,
  };
}

export async function getOrganizationAiSettingsRow(
  organizationId: string,
): Promise<AiAgentSettingsRow | null> {
  const [row] = await db
    .select(ROW_COLUMNS)
    .from(aiAgentSettings)
    .where(
      and(
        eq(aiAgentSettings.organizationId, organizationId),
        isNull(aiAgentSettings.projectId),
      ),
    )
    .limit(1);
  return row ? toRow(row) : null;
}

export async function getProjectAiSettingsRow(
  projectId: string,
): Promise<AiAgentSettingsRow | null> {
  const [row] = await db
    .select(ROW_COLUMNS)
    .from(aiAgentSettings)
    .where(
      and(
        eq(aiAgentSettings.projectId, projectId),
        isNull(aiAgentSettings.organizationId),
      ),
    )
    .limit(1);
  return row ? toRow(row) : null;
}

export async function upsertOrganizationAiSettingsRow(
  organizationId: string,
  input: AiAgentSettingsInput,
  credentialsCiphertext: string | null,
): Promise<void> {
  await db
    .insert(aiAgentSettings)
    .values({
      organizationId,
      projectId: null,
      provider: input.provider,
      model: input.model ?? "",
      baseUrl: normalizeBaseUrl(input.baseUrl),
      credentials: credentialsCiphertext,
    })
    .onConflictDoUpdate({
      // The unique indexes are PARTIAL (… WHERE project_id is null), so the
      // conflict target must repeat the predicate or SQLite rejects it with
      // "ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE
      // constraint" on every UPDATE of an existing row.
      target: aiAgentSettings.organizationId,
      targetWhere: sql`${aiAgentSettings.projectId} is null`,
      set: {
        provider: input.provider,
        model: input.model ?? "",
        baseUrl: normalizeBaseUrl(input.baseUrl),
        credentials: credentialsCiphertext,
        updatedAt: new Date().toISOString(),
      },
    });
}

export async function upsertProjectAiSettingsRow(
  projectId: string,
  input: AiAgentSettingsInput,
  credentialsCiphertext: string | null,
): Promise<void> {
  await db
    .insert(aiAgentSettings)
    .values({
      projectId,
      organizationId: null,
      provider: input.provider,
      model: input.model ?? "",
      baseUrl: normalizeBaseUrl(input.baseUrl),
      credentials: credentialsCiphertext,
    })
    .onConflictDoUpdate({
      target: aiAgentSettings.projectId,
      targetWhere: sql`${aiAgentSettings.organizationId} is null`,
      set: {
        provider: input.provider,
        model: input.model ?? "",
        baseUrl: normalizeBaseUrl(input.baseUrl),
        credentials: credentialsCiphertext,
        updatedAt: new Date().toISOString(),
      },
    });
}

/** Scope reset (S23): delete the override row; the parent scope inherits. */
export async function deleteProjectAiSettings(projectId: string): Promise<void> {
  await db
    .delete(aiAgentSettings)
    .where(
      and(
        eq(aiAgentSettings.projectId, projectId),
        isNull(aiAgentSettings.organizationId),
      ),
    );
}

export async function deleteOrganizationAiSettings(
  organizationId: string,
): Promise<void> {
  await db
    .delete(aiAgentSettings)
    .where(
      and(
        eq(aiAgentSettings.organizationId, organizationId),
        isNull(aiAgentSettings.projectId),
      ),
    );
}

// Back-compat helpers used by existing callers/tests (provider+model only).

export async function getOrganizationAiSettings(
  organizationId: string,
): Promise<{ provider: string; model: string | null } | null> {
  const row = await getOrganizationAiSettingsRow(organizationId);
  return row ? { provider: row.provider, model: row.model } : null;
}

export async function getProjectAiSettings(
  projectId: string,
): Promise<{ provider: string; model: string | null } | null> {
  const row = await getProjectAiSettingsRow(projectId);
  return row ? { provider: row.provider, model: row.model } : null;
}

export async function upsertOrganizationAiSettings(
  organizationId: string,
  input: AiAgentSettingsInput,
): Promise<void> {
  await upsertOrganizationAiSettingsRow(organizationId, input, input.credentialsCiphertext ?? null);
}

export async function upsertProjectAiSettings(
  projectId: string,
  input: AiAgentSettingsInput,
): Promise<void> {
  if (input.model === null && input.baseUrl == null) {
    await deleteProjectAiSettings(projectId);
    return;
  }
  await upsertProjectAiSettingsRow(projectId, input, input.credentialsCiphertext ?? null);
}

export const AiSettingsRepository = {
  getOrganizationAiSettingsRow,
  getProjectAiSettingsRow,
  upsertOrganizationAiSettingsRow,
  upsertProjectAiSettingsRow,
  deleteProjectAiSettings,
  deleteOrganizationAiSettings,
  getOrganizationAiSettings,
  getProjectAiSettings,
  upsertOrganizationAiSettings,
  upsertProjectAiSettings,
} as const;
