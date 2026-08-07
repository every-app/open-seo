import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { indexingEvents } from "@/db/schema";
import type { IndexingEventStatus, IndexingEventType } from "@/shared/indexnow";

export type IndexingEvent = typeof indexingEvents.$inferSelect;

async function insert(input: {
  id?: string;
  projectId: string;
  organizationId: string;
  url: string;
  eventType: IndexingEventType;
  status: IndexingEventStatus;
  httpStatus?: number | null;
  responseBody?: string | null;
  attempts?: number;
}): Promise<IndexingEvent> {
  const [row] = await db
    .insert(indexingEvents)
    .values({
      id: input.id ?? crypto.randomUUID(),
      projectId: input.projectId,
      organizationId: input.organizationId,
      url: input.url,
      eventType: input.eventType,
      status: input.status,
      httpStatus: input.httpStatus ?? null,
      responseBody: input.responseBody ?? null,
      attempts: input.attempts ?? 0,
    })
    .returning();
  if (!row) throw new Error("Failed to insert indexing_event");
  return row;
}

async function listByProjectId(
  projectId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<IndexingEvent[]> {
  return db
    .select()
    .from(indexingEvents)
    .where(eq(indexingEvents.projectId, projectId))
    .orderBy(desc(indexingEvents.createdAt), desc(indexingEvents.id))
    .limit(options.limit ?? 100)
    .offset(options.offset ?? 0);
}

async function listRecentSuccessfulByProjectId(
  projectId: string,
  limit = 1_000,
): Promise<IndexingEvent[]> {
  return db
    .select()
    .from(indexingEvents)
    .where(
      and(
        eq(indexingEvents.projectId, projectId),
        eq(indexingEvents.eventType, "submitted"),
        eq(indexingEvents.status, "success"),
      ),
    )
    .orderBy(desc(indexingEvents.createdAt), desc(indexingEvents.id))
    .limit(Math.min(Math.max(limit, 1), 5_000));
}

async function markAttempted(id: string): Promise<IndexingEvent | null> {
  const [row] = await db
    .update(indexingEvents)
    .set({
      attempts: sql`${indexingEvents.attempts} + 1`,
      updatedAt: sql`(current_timestamp)`,
    })
    .where(eq(indexingEvents.id, id))
    .returning();
  return row ?? null;
}

async function markResult(
  id: string,
  input: {
    eventType: IndexingEventType;
    status: IndexingEventStatus;
    httpStatus?: number | null;
    responseBody?: string | null;
  },
): Promise<IndexingEvent | null> {
  const [row] = await db
    .update(indexingEvents)
    .set({
      eventType: input.eventType,
      status: input.status,
      httpStatus: input.httpStatus ?? null,
      responseBody: input.responseBody ?? null,
      updatedAt: sql`(current_timestamp)`,
    })
    .where(eq(indexingEvents.id, id))
    .returning();
  return row ?? null;
}

export const IndexingEventRepository = {
  insert,
  listByProjectId,
  listRecentSuccessfulByProjectId,
  markAttempted,
  markResult,
};
