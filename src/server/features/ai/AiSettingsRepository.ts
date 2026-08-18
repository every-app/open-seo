import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { aiAgentSettings } from "@/db/schema";

// Per-scope AI provider/model selection for the in-app agent. Rows are either
// organization-scoped (global default) or project-scoped (override); the
// repository enforces "exactly one scope per row". Credentials never live in
// this table — the API key remains a server-side deployment secret.
//
// A null/empty model means "inherit": project row -> organization row ->
// environment default.

export type AiAgentSettingsInput = {
  provider: string;
  model: string | null;
};

function normalizeModel(model: string | null | undefined): string | null {
  const trimmed = model?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export async function getOrganizationAiSettings(
  organizationId: string,
): Promise<AiAgentSettingsInput | null> {
  const [row] = await db
    .select({
      provider: aiAgentSettings.provider,
      model: aiAgentSettings.model,
    })
    .from(aiAgentSettings)
    .where(
      and(
        eq(aiAgentSettings.organizationId, organizationId),
        isNull(aiAgentSettings.projectId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { provider: row.provider, model: normalizeModel(row.model) };
}

export async function getProjectAiSettings(
  projectId: string,
): Promise<AiAgentSettingsInput | null> {
  const [row] = await db
    .select({
      provider: aiAgentSettings.provider,
      model: aiAgentSettings.model,
    })
    .from(aiAgentSettings)
    .where(
      and(
        eq(aiAgentSettings.projectId, projectId),
        isNull(aiAgentSettings.organizationId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { provider: row.provider, model: normalizeModel(row.model) };
}

export async function upsertOrganizationAiSettings(
  organizationId: string,
  input: AiAgentSettingsInput,
): Promise<void> {
  await db
    .insert(aiAgentSettings)
    .values({
      organizationId,
      projectId: null,
      provider: input.provider,
      model: input.model ?? "",
    })
    .onConflictDoUpdate({
      target: aiAgentSettings.organizationId,
      set: {
        provider: input.provider,
        model: input.model ?? "",
        updatedAt: new Date().toISOString(),
      },
    });
}

// Setting model to null clears the project override entirely (inherit the
// organization row / environment default).
export async function upsertProjectAiSettings(
  projectId: string,
  input: AiAgentSettingsInput,
): Promise<void> {
  if (input.model === null) {
    await db
      .delete(aiAgentSettings)
      .where(
        and(
          eq(aiAgentSettings.projectId, projectId),
          isNull(aiAgentSettings.organizationId),
        ),
      );
    return;
  }
  await db
    .insert(aiAgentSettings)
    .values({
      projectId,
      organizationId: null,
      provider: input.provider,
      model: input.model,
    })
    .onConflictDoUpdate({
      target: aiAgentSettings.projectId,
      set: {
        provider: input.provider,
        model: input.model,
        updatedAt: new Date().toISOString(),
      },
    });
}

export const AiSettingsRepository = {
  getOrganizationAiSettings,
  getProjectAiSettings,
  upsertOrganizationAiSettings,
  upsertProjectAiSettings,
} as const;