import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  contentExecutionItems,
  contentExecutionKeywordAssignments,
  savedKeywords,
} from "@/db/schema";
import { AppError } from "@/server/lib/errors";
import type {
  ContentExecutionItem,
  ContentExecutionStatus,
  ContentExecutionSummary,
} from "@/types/content-execution";
import { parseContentExecutionStatus } from "@/types/content-execution";

type CreateParams = {
  id: string;
  projectId: string;
  title: string;
  targetUrl?: string;
  status: ContentExecutionStatus;
  owner?: string;
  dueDate?: string;
  jiraIssueKey?: string;
  jiraIssueUrl?: string;
  savedKeywordIds: string[];
  primarySavedKeywordId: string;
};

type UpdateParams = {
  projectId: string;
  executionItemId: string;
  title?: string;
  targetUrl?: string | null;
  status?: ContentExecutionStatus;
  owner?: string | null;
  dueDate?: string | null;
  jiraIssueKey?: string | null;
  jiraIssueUrl?: string | null;
};

const QUERY_CHUNK_SIZE = 80;

async function requireOwnedKeywords(params: CreateParams) {
  const rows = await db
    .select({ id: savedKeywords.id })
    .from(savedKeywords)
    .where(
      and(
        eq(savedKeywords.projectId, params.projectId),
        inArray(savedKeywords.id, params.savedKeywordIds),
      ),
    );
  if (rows.length !== params.savedKeywordIds.length) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Every selected keyword must belong to this project.",
    );
  }
}

async function requireUnassignedKeywords(params: CreateParams) {
  const rows = await db
    .select({
      savedKeywordId: contentExecutionKeywordAssignments.savedKeywordId,
    })
    .from(contentExecutionKeywordAssignments)
    .where(
      inArray(
        contentExecutionKeywordAssignments.savedKeywordId,
        params.savedKeywordIds,
      ),
    );
  if (rows.length > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "One or more keywords already belong to another execution item.",
    );
  }
}

async function createExecutionItem(params: CreateParams) {
  await requireOwnedKeywords(params);
  await requireUnassignedKeywords(params);
  await runBatch((tx) => [
    tx.insert(contentExecutionItems).values({
      id: params.id,
      projectId: params.projectId,
      title: params.title,
      targetUrl: params.targetUrl ?? null,
      status: params.status,
      owner: params.owner ?? null,
      dueDate: params.dueDate ?? null,
      jiraIssueKey: params.jiraIssueKey ?? null,
      jiraIssueUrl: params.jiraIssueUrl ?? null,
    }),
    ...params.savedKeywordIds.map((savedKeywordId) =>
      tx.insert(contentExecutionKeywordAssignments).values({
        executionItemId: params.id,
        savedKeywordId,
        isPrimary: savedKeywordId === params.primarySavedKeywordId,
      }),
    ),
  ]);
  return getExecutionItemById(params.id, params.projectId);
}

async function listAssignmentRows(projectId: string, itemIds: string[]) {
  const rows: {
    executionItemId: string;
    id: string;
    keyword: string;
    isPrimary: boolean;
  }[] = [];
  for (let index = 0; index < itemIds.length; index += QUERY_CHUNK_SIZE) {
    const chunk = itemIds.slice(index, index + QUERY_CHUNK_SIZE);
    rows.push(...(await listAssignmentChunk(projectId, chunk)));
  }
  return rows;
}

async function listAssignmentChunk(projectId: string, itemIds: string[]) {
  return db
    .select({
      executionItemId: contentExecutionKeywordAssignments.executionItemId,
      id: savedKeywords.id,
      keyword: savedKeywords.keyword,
      isPrimary: contentExecutionKeywordAssignments.isPrimary,
    })
    .from(contentExecutionKeywordAssignments)
    .innerJoin(
      savedKeywords,
      eq(contentExecutionKeywordAssignments.savedKeywordId, savedKeywords.id),
    )
    .where(
      and(
        eq(savedKeywords.projectId, projectId),
        inArray(contentExecutionKeywordAssignments.executionItemId, itemIds),
      ),
    )
    .orderBy(
      desc(contentExecutionKeywordAssignments.isPrimary),
      asc(savedKeywords.keyword),
    );
}

function mapItems(
  rows: (typeof contentExecutionItems.$inferSelect)[],
  assignments: Awaited<ReturnType<typeof listAssignmentRows>>,
): ContentExecutionItem[] {
  return rows.map((row) => {
    const keywords = assignments
      .filter((assignment) => assignment.executionItemId === row.id)
      .map(({ id, keyword, isPrimary }) => ({ id, keyword, isPrimary }));
    return {
      ...row,
      status: parseContentExecutionStatus(row.status),
      primaryKeyword:
        keywords.find((keyword) => keyword.isPrimary)?.keyword ?? "",
      keywordCount: keywords.length,
      keywords,
    };
  });
}

async function listExecutionItemsByProject(projectId: string) {
  const rows = await db
    .select()
    .from(contentExecutionItems)
    .where(eq(contentExecutionItems.projectId, projectId))
    .orderBy(
      desc(contentExecutionItems.updatedAt),
      asc(contentExecutionItems.id),
    );
  const assignments = await listAssignmentRows(
    projectId,
    rows.map((row) => row.id),
  );
  return mapItems(rows, assignments);
}

async function getExecutionItemById(id: string, projectId: string) {
  const [row] = await db
    .select()
    .from(contentExecutionItems)
    .where(
      and(
        eq(contentExecutionItems.id, id),
        eq(contentExecutionItems.projectId, projectId),
      ),
    )
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND");
  const assignments = await listAssignmentRows(projectId, [id]);
  return mapItems([row], assignments)[0];
}

async function listSummariesBySavedKeywordIds(
  projectId: string,
  savedKeywordIds: string[],
) {
  const summaries = new Map<string, ContentExecutionSummary>();
  if (savedKeywordIds.length === 0) return summaries;
  for (
    let index = 0;
    index < savedKeywordIds.length;
    index += QUERY_CHUNK_SIZE
  ) {
    const chunk = savedKeywordIds.slice(index, index + QUERY_CHUNK_SIZE);
    const rows = await listSummaryRows(projectId, chunk);
    for (const { savedKeywordId, item } of rows) {
      summaries.set(savedKeywordId, mapSummary(item));
    }
  }
  return summaries;
}

async function listSummaryRows(projectId: string, savedKeywordIds: string[]) {
  return db
    .select({
      savedKeywordId: contentExecutionKeywordAssignments.savedKeywordId,
      item: contentExecutionItems,
    })
    .from(contentExecutionKeywordAssignments)
    .innerJoin(
      contentExecutionItems,
      eq(
        contentExecutionKeywordAssignments.executionItemId,
        contentExecutionItems.id,
      ),
    )
    .where(
      and(
        eq(contentExecutionItems.projectId, projectId),
        inArray(
          contentExecutionKeywordAssignments.savedKeywordId,
          savedKeywordIds,
        ),
      ),
    );
}

function mapSummary(
  item: typeof contentExecutionItems.$inferSelect,
): ContentExecutionSummary {
  return {
    id: item.id,
    title: item.title,
    status: parseContentExecutionStatus(item.status),
    owner: item.owner,
    dueDate: item.dueDate,
    jiraIssueKey: item.jiraIssueKey,
    jiraIssueUrl: item.jiraIssueUrl,
  };
}

async function updateExecutionItem(params: UpdateParams) {
  const { executionItemId, projectId, ...changes } = params;
  const [row] = await db
    .update(contentExecutionItems)
    .set({ ...changes, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(contentExecutionItems.id, executionItemId),
        eq(contentExecutionItems.projectId, projectId),
      ),
    )
    .returning({ id: contentExecutionItems.id });
  if (!row) throw new AppError("NOT_FOUND");
  return getExecutionItemById(row.id, projectId);
}

export const ContentExecutionRepository = {
  createExecutionItem,
  listExecutionItemsByProject,
  listSummariesBySavedKeywordIds,
  updateExecutionItem,
} as const;
