import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import { projectAiModels } from "@/db/schema";
import {
  isModelVersion,
  PROMPT_EXPLORER_MODELS,
  type PromptExplorerModelVersions,
} from "@/types/schemas/ai-search";

// Backing store for the per-project AI model defaults set on the AI Models
// settings page. A missing row means "use the app default", so a project with
// no rows tracks app-level model bumps automatically.

async function list(projectId: string): Promise<PromptExplorerModelVersions> {
  const rows = await db
    .select({
      provider: projectAiModels.provider,
      modelName: projectAiModels.modelName,
    })
    .from(projectAiModels)
    .where(eq(projectAiModels.projectId, projectId));

  const versions: Record<string, string> = {};
  for (const row of rows) {
    // A stored version can leave the selectable catalog in a later release;
    // dropping it here degrades that provider to the app default instead of
    // dispatching a model name DataForSEO would bill and reject.
    if (!isModelVersion(row.provider, row.modelName)) continue;
    versions[row.provider] = row.modelName;
  }
  return versions as PromptExplorerModelVersions;
}

/**
 * Replace the project's stored choices with `versions`. The settings page
 * always submits the full record, so delete-then-insert keeps "reset to
 * default" and "pick a version" one code path.
 */
async function replace(
  projectId: string,
  versions: PromptExplorerModelVersions,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const rows = PROMPT_EXPLORER_MODELS.flatMap((provider) => {
    const modelName = versions[provider];
    return modelName ? [{ projectId, provider, modelName, updatedAt }] : [];
  });
  await runBatch((tx) => [
    tx.delete(projectAiModels).where(eq(projectAiModels.projectId, projectId)),
    ...(rows.length > 0 ? [tx.insert(projectAiModels).values(rows)] : []),
  ]);
}

export const AiModelSettingsRepository = { list, replace };
