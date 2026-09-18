import { and, count, desc, eq, sum } from "drizzle-orm";
import { db } from "@/db";
import { projects, reports } from "@/db/schema";
import type { ReportMetadata } from "@/types/schemas/reports";

// Backing store for reports. Every query filters on `project_id` as well as
// `id`: callers authorize the projectId they were given, not the child row, so
// a guessed id from another project must not resolve.
//
// `html` is never selected here except by getReportHtml — a list read that
// pulled documents would put megabytes on the app worker's heap.

const metadataColumns = {
  id: reports.id,
  projectId: reports.projectId,
  title: reports.title,
  summary: reports.summary,
  skill: reports.skill,
  templateId: reports.templateId,
  createdBy: reports.createdBy,
  createdByUserId: reports.createdByUserId,
  sizeBytes: reports.sizeBytes,
  shareToken: reports.shareToken,
  sharedAt: reports.sharedAt,
  createdAt: reports.createdAt,
  updatedAt: reports.updatedAt,
};

async function listReports(params: {
  projectId: string;
  limit: number;
  offset: number;
}): Promise<ReportMetadata[]> {
  return (
    db
      .select(metadataColumns)
      .from(reports)
      .where(eq(reports.projectId, params.projectId))
      // Matches reports_project_updated_idx; `id` breaks same-timestamp ties so
      // the order is total.
      .orderBy(desc(reports.updatedAt), desc(reports.id))
      .limit(params.limit)
      .offset(params.offset)
  );
}

async function getReport(
  projectId: string,
  reportId: string,
): Promise<ReportMetadata | null> {
  const [row] = await db
    .select(metadataColumns)
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

// The one query that is not project-scoped, and the only one allowed to be:
// the render route (/r/<reportId>) arrives with a report id and nothing else.
// It returns the owning project id alone — no content, no metadata — and the
// caller authorizes that project before reading anything else.
async function getReportProjectId(reportId: string): Promise<string | null> {
  const [row] = await db
    .select({ projectId: reports.projectId })
    .from(reports)
    .where(eq(reports.id, reportId))
    .limit(1);
  return row?.projectId ?? null;
}

async function getReportHtml(
  projectId: string,
  reportId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ html: reports.html })
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.projectId, projectId)))
    .limit(1);
  return row?.html ?? null;
}

// Metadata and document in one read, for get_report's includeHtml path — the
// only caller that needs both, and the only reason to select `html` alongside
// the metadata columns.
async function getReportWithHtml(
  projectId: string,
  reportId: string,
): Promise<(ReportMetadata & { html: string }) | null> {
  const [row] = await db
    .select({ ...metadataColumns, html: reports.html })
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

async function findReportByTitle(
  projectId: string,
  title: string,
): Promise<{ id: string; title: string } | null> {
  const [row] = await db
    .select({ id: reports.id, title: reports.title })
    .from(reports)
    .where(and(eq(reports.projectId, projectId), eq(reports.title, title)))
    .limit(1);
  return row ?? null;
}

async function countReports(projectId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(reports)
    .where(eq(reports.projectId, projectId));
  return row?.value ?? 0;
}

// Stored bytes across every project the organization owns. SUM() comes back as
// a string on Postgres and a number on SQLite, and as null on an empty set.
async function sumReportBytesForOrganization(
  organizationId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: sum(reports.sizeBytes) })
    .from(reports)
    .innerJoin(projects, eq(projects.id, reports.projectId))
    .where(eq(projects.organizationId, organizationId));
  return Number(row?.value ?? 0);
}

// createdAt/updatedAt are stamped here, not left to the column defaults: the
// two dialects' defaults render different formats and the list order is a
// lexicographic comparison against app-written ISO stamps.
async function insertReport(params: {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  html: string;
  skill: string | null;
  templateId: string | null;
  createdBy: string;
  createdByUserId: string;
  sizeBytes: number;
}): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(reports)
    .values({ ...params, createdAt: now, updatedAt: now });
}

// Content only: `created_by` and `created_by_user_id` are stamped at create and
// never re-stamped, so "created by" keeps meaning what it says after an agent
// replaces the body.
async function updateReportContent(params: {
  reportId: string;
  projectId: string;
  title: string;
  summary: string;
  html: string;
  skill: string | null;
  templateId: string | null;
  sizeBytes: number;
}): Promise<void> {
  await db
    .update(reports)
    .set({
      title: params.title,
      summary: params.summary,
      html: params.html,
      skill: params.skill,
      templateId: params.templateId,
      sizeBytes: params.sizeBytes,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(reports.id, params.reportId),
        eq(reports.projectId, params.projectId),
      ),
    );
}

// The share link's own read, and the second query here with no project id to
// scope it: `/s/<token>` arrives with a token and nothing else. The token is
// the authorization, so the row is joined to its project for the organization
// id (telemetry grouping) and the archived flag the public page renders.
async function getSharedReportByToken(token: string): Promise<{
  id: string;
  projectId: string;
  organizationId: string;
  title: string;
  summary: string;
  skill: string | null;
  updatedAt: string;
  archived: boolean;
} | null> {
  const [row] = await db
    .select({
      id: reports.id,
      projectId: reports.projectId,
      organizationId: projects.organizationId,
      title: reports.title,
      summary: reports.summary,
      skill: reports.skill,
      updatedAt: reports.updatedAt,
      archivedAt: projects.archivedAt,
    })
    .from(reports)
    .innerJoin(projects, eq(projects.id, reports.projectId))
    .where(eq(reports.shareToken, token))
    .limit(1);
  if (!row) return null;
  const { archivedAt, ...report } = row;
  return { ...report, archived: archivedAt !== null };
}

// Share state only, so minting or revoking a link never touches `updated_at` —
// the app shows "Updated" as when the content last changed, and sharing is not
// a content change.
async function setShareToken(
  projectId: string,
  reportId: string,
  // The service mints both halves, so the token it hands back to the caller
  // and the stamp stored with it come from one clock.
  share: { shareToken: string; sharedAt: string } | null,
): Promise<void> {
  await db
    .update(reports)
    .set({
      shareToken: share?.shareToken ?? null,
      sharedAt: share?.sharedAt ?? null,
    })
    .where(and(eq(reports.id, reportId), eq(reports.projectId, projectId)));
}

/** True when a row was deleted; false when the id is not in this project. */
async function deleteReport(
  projectId: string,
  reportId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(reports)
    .where(and(eq(reports.id, reportId), eq(reports.projectId, projectId)))
    .returning({ id: reports.id });
  return deleted.length > 0;
}

export const ReportRepository = {
  listReports,
  getReport,
  getReportProjectId,
  getReportHtml,
  getReportWithHtml,
  getSharedReportByToken,
  setShareToken,
  findReportByTitle,
  countReports,
  sumReportBytesForOrganization,
  insertReport,
  updateReportContent,
  deleteReport,
} as const;
