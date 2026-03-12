import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, psiAuditResults } from "@/db/schema";

async function ensureProjectAccess(projectId: string, userId: string) {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
  });

  if (!project) {
    throw new Error("Project not found");
  }
}

async function createAuditResult(data: {
  id: string;
  projectId: string;
  requestedUrl: string;
  finalUrl: string;
  strategy: "mobile" | "desktop";
  status: "completed" | "failed";
  performanceScore?: number | null;
  accessibilityScore?: number | null;
  bestPracticesScore?: number | null;
  seoScore?: number | null;
  firstContentfulPaint?: string | null;
  largestContentfulPaint?: string | null;
  totalBlockingTime?: string | null;
  cumulativeLayoutShift?: string | null;
  speedIndex?: string | null;
  timeToInteractive?: string | null;
  lighthouseVersion?: string | null;
  errorMessage?: string | null;
  r2Key?: string | null;
  payloadSizeBytes?: number | null;
}) {
  await db.insert(psiAuditResults).values({
    id: data.id,
    projectId: data.projectId,
    requestedUrl: data.requestedUrl,
    finalUrl: data.finalUrl,
    strategy: data.strategy,
    status: data.status,
    performanceScore: data.performanceScore ?? null,
    accessibilityScore: data.accessibilityScore ?? null,
    bestPracticesScore: data.bestPracticesScore ?? null,
    seoScore: data.seoScore ?? null,
    firstContentfulPaint: data.firstContentfulPaint ?? null,
    largestContentfulPaint: data.largestContentfulPaint ?? null,
    totalBlockingTime: data.totalBlockingTime ?? null,
    cumulativeLayoutShift: data.cumulativeLayoutShift ?? null,
    speedIndex: data.speedIndex ?? null,
    timeToInteractive: data.timeToInteractive ?? null,
    lighthouseVersion: data.lighthouseVersion ?? null,
    errorMessage: data.errorMessage ?? null,
    r2Key: data.r2Key ?? null,
    payloadSizeBytes: data.payloadSizeBytes ?? null,
    createdAt: new Date().toISOString(),
  });
}

async function listAuditResults(input: {
  projectId: string;
  userId: string;
  strategy?: "mobile" | "desktop";
  limit: number;
}) {
  await ensureProjectAccess(input.projectId, input.userId);

  return db.query.psiAuditResults.findMany({
    where:
      input.strategy != null
        ? and(
            eq(psiAuditResults.projectId, input.projectId),
            eq(psiAuditResults.strategy, input.strategy),
          )
        : eq(psiAuditResults.projectId, input.projectId),
    orderBy: desc(psiAuditResults.createdAt),
    limit: input.limit,
  });
}

async function getAuditResult(input: {
  projectId: string;
  userId: string;
  auditId: string;
}) {
  await ensureProjectAccess(input.projectId, input.userId);

  return db.query.psiAuditResults.findFirst({
    where: and(
      eq(psiAuditResults.id, input.auditId),
      eq(psiAuditResults.projectId, input.projectId),
    ),
  });
}

export const PsiAuditRepository = {
  createAuditResult,
  listAuditResults,
  getAuditResult,
} as const;
