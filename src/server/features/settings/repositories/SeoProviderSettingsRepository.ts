import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { seoProviderSettings } from "@/db/schema";

export type SeoProviderSettingsRow = {
  provider: string;
  enabled: boolean;
  /** AES-GCM encrypted ciphertext { login, password }, or null. */
  credentialsCiphertext: string | null;
  organizationId: string | null;
  projectId: string | null;
  updatedAt: string;
};

export type SeoProviderSettingsInput = {
  enabled?: boolean;
  /** Encrypted credentials ciphertext. Pass undefined to preserve existing. */
  credentialsCiphertext?: string | null;
};

const ROW_COLUMNS = {
  provider: seoProviderSettings.provider,
  enabled: seoProviderSettings.enabled,
  credentialsCiphertext: seoProviderSettings.credentials,
  organizationId: seoProviderSettings.organizationId,
  projectId: seoProviderSettings.projectId,
  updatedAt: seoProviderSettings.updatedAt,
};

type RawRow = {
  provider: string;
  enabled: boolean;
  credentialsCiphertext: string | null;
  organizationId: string | null;
  projectId: string | null;
  updatedAt: string;
};

function toRow(raw: RawRow): SeoProviderSettingsRow {
  return {
    provider: raw.provider,
    enabled: Boolean(raw.enabled),
    credentialsCiphertext: raw.credentialsCiphertext,
    organizationId: raw.organizationId,
    projectId: raw.projectId,
    updatedAt: raw.updatedAt,
  };
}

export async function getOrganizationProviderSettingsRow(
  organizationId: string,
  provider = "dataforseo",
): Promise<SeoProviderSettingsRow | null> {
  const [row] = await db
    .select(ROW_COLUMNS)
    .from(seoProviderSettings)
    .where(
      and(
        eq(seoProviderSettings.organizationId, organizationId),
        eq(seoProviderSettings.provider, provider),
        isNull(seoProviderSettings.projectId),
      ),
    )
    .limit(1);
  return row ? toRow(row) : null;
}

export async function getProjectProviderSettingsRow(
  projectId: string,
  provider = "dataforseo",
): Promise<SeoProviderSettingsRow | null> {
  const [row] = await db
    .select(ROW_COLUMNS)
    .from(seoProviderSettings)
    .where(
      and(
        eq(seoProviderSettings.projectId, projectId),
        eq(seoProviderSettings.provider, provider),
        isNull(seoProviderSettings.organizationId),
      ),
    )
    .limit(1);
  return row ? toRow(row) : null;
}

export async function upsertOrganizationProviderSettingsRow(
  organizationId: string,
  provider: string,
  input: SeoProviderSettingsInput,
): Promise<void> {
  const now = new Date().toISOString();
  const values = {
    organizationId,
    projectId: null,
    provider,
    enabled: input.enabled ?? true,
    credentials: input.credentialsCiphertext ?? null,
    updatedAt: now,
  };

  const setUpdate: Record<string, unknown> = {
    updatedAt: now,
  };
  if (input.enabled !== undefined) {
    setUpdate.enabled = input.enabled;
  }
  if (input.credentialsCiphertext !== undefined) {
    setUpdate.credentials = input.credentialsCiphertext;
  }

  await db
    .insert(seoProviderSettings)
    .values(values)
    .onConflictDoUpdate({
      target: [seoProviderSettings.provider, seoProviderSettings.organizationId],
      targetWhere: sql`${seoProviderSettings.projectId} is null`,
      set: setUpdate,
    });
}

export async function upsertProjectProviderSettingsRow(
  projectId: string,
  provider: string,
  input: SeoProviderSettingsInput,
): Promise<void> {
  const now = new Date().toISOString();
  const values = {
    projectId,
    organizationId: null,
    provider,
    enabled: input.enabled ?? true,
    credentials: input.credentialsCiphertext ?? null,
    updatedAt: now,
  };

  const setUpdate: Record<string, unknown> = {
    updatedAt: now,
  };
  if (input.enabled !== undefined) {
    setUpdate.enabled = input.enabled;
  }
  if (input.credentialsCiphertext !== undefined) {
    setUpdate.credentials = input.credentialsCiphertext;
  }

  await db
    .insert(seoProviderSettings)
    .values(values)
    .onConflictDoUpdate({
      target: [seoProviderSettings.provider, seoProviderSettings.projectId],
      targetWhere: sql`${seoProviderSettings.organizationId} is null`,
      set: setUpdate,
    });
}

export async function deleteOrganizationProviderSettings(
  organizationId: string,
  provider = "dataforseo",
): Promise<void> {
  await db
    .delete(seoProviderSettings)
    .where(
      and(
        eq(seoProviderSettings.organizationId, organizationId),
        eq(seoProviderSettings.provider, provider),
        isNull(seoProviderSettings.projectId),
      ),
    );
}

export async function deleteProjectProviderSettings(
  projectId: string,
  provider = "dataforseo",
): Promise<void> {
  await db
    .delete(seoProviderSettings)
    .where(
      and(
        eq(seoProviderSettings.projectId, projectId),
        eq(seoProviderSettings.provider, provider),
        isNull(seoProviderSettings.organizationId),
      ),
    );
}

export const SeoProviderSettingsRepository = {
  getOrganizationProviderSettingsRow,
  getProjectProviderSettingsRow,
  upsertOrganizationProviderSettingsRow,
  upsertProjectProviderSettingsRow,
  deleteOrganizationProviderSettings,
  deleteProjectProviderSettings,
} as const;
