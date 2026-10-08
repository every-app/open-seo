import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reportTemplates } from "@/db/schema";
import type { ReportBrand } from "@/shared/report-brand";
import type {
  ReportTemplate,
  ReportTemplateWithLogo,
} from "@/types/schemas/report-templates";

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
  brandColor: reportTemplates.brandColor,
  brandColor2: reportTemplates.brandColor2,
  accentColor: reportTemplates.accentColor,
  canvasColor: reportTemplates.canvasColor,
  // The logo's size, not its bytes: lists feed the project-context digest
  // every agent reads, and ten logos would be most of it.
  logoChars: sql<number | null>`length(${reportTemplates.logoDataUri})`,
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
): Promise<ReportTemplateWithLogo | null> {
  const [row] = await db
    .select({ ...columns, logoDataUri: reportTemplates.logoDataUri })
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
  brand: ReportBrand;
  createdBy: string;
  createdByUserId: string;
}): Promise<void> {
  const { brand, ...rest } = params;
  const now = new Date().toISOString();
  await db
    .insert(reportTemplates)
    .values({ ...rest, ...brand, createdAt: now, updatedAt: now });
}

// Content only: the attribution columns are stamped at create and never
// re-stamped, so "created by" keeps meaning what it says after an edit.
async function updateTemplate(params: {
  templateId: string;
  projectId: string;
  name: string;
  description: string;
  instructions: string;
  /** Undefined fields keep their stored value; Drizzle leaves them out of the SET. */
  brand: Partial<ReportBrand>;
}): Promise<void> {
  await db
    .update(reportTemplates)
    .set({
      name: params.name,
      description: params.description,
      instructions: params.instructions,
      ...params.brand,
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
