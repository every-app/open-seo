import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reportTemplates } from "@/db/schema";
import type { ReportTemplate } from "@/types/schemas/report-templates";

// Backing store for report templates. Every query filters on `project_id` as
// well as `id` — never a bare `WHERE id = ?` — because callers authorize the
// projectId they were given, not the child row, so a guessed id from another
// project must not resolve.

const columns = {
  id: reportTemplates.id,
  projectId: reportTemplates.projectId,
  name: reportTemplates.name,
  description: reportTemplates.description,
  instructions: reportTemplates.instructions,
  createdBy: reportTemplates.createdBy,
  createdByUserId: reportTemplates.createdByUserId,
  createdAt: reportTemplates.createdAt,
  updatedAt: reportTemplates.updatedAt,
};

async function listTemplates(projectId: string): Promise<ReportTemplate[]> {
  return db
    .select(columns)
    .from(reportTemplates)
    .where(eq(reportTemplates.projectId, projectId))
    .orderBy(asc(reportTemplates.name), asc(reportTemplates.id));
}

async function getTemplate(
  projectId: string,
  templateId: string,
): Promise<ReportTemplate | null> {
  const [row] = await db
    .select(columns)
    .from(reportTemplates)
    .where(
      and(
        eq(reportTemplates.id, templateId),
        eq(reportTemplates.projectId, projectId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// createdAt/updatedAt are stamped here, not left to the column defaults: the
// two dialects' defaults render different formats.
async function insertTemplate(params: {
  id: string;
  projectId: string;
  name: string;
  description: string;
  instructions: string;
  createdBy: string;
  createdByUserId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(reportTemplates)
    .values({ ...params, createdAt: now, updatedAt: now });
}

// Content only: the attribution columns are stamped at create and never
// re-stamped, so "created by" keeps meaning what it says after an edit.
async function updateTemplate(params: {
  templateId: string;
  projectId: string;
  name: string;
  description: string;
  instructions: string;
}): Promise<void> {
  await db
    .update(reportTemplates)
    .set({
      name: params.name,
      description: params.description,
      instructions: params.instructions,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(reportTemplates.id, params.templateId),
        eq(reportTemplates.projectId, params.projectId),
      ),
    );
}

/** True when a row was deleted; false when the id is not in this project. */
async function deleteTemplate(
  projectId: string,
  templateId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(reportTemplates)
    .where(
      and(
        eq(reportTemplates.id, templateId),
        eq(reportTemplates.projectId, projectId),
      ),
    )
    .returning({ id: reportTemplates.id });
  return deleted.length > 0;
}

export const ReportTemplateRepository = {
  listTemplates,
  getTemplate,
  insertTemplate,
  updateTemplate,
  deleteTemplate,
} as const;
