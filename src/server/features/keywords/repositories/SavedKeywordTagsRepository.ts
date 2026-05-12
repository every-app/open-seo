import { and, asc, count, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/db";
import {
  savedKeywordTagAssignments,
  savedKeywordTags,
  savedKeywords,
} from "@/db/schema";
import {
  normalizeSavedKeywordTag,
  normalizeSavedKeywordTags,
} from "@/shared/saved-keyword-tags";

export type SavedKeywordTagRecord = typeof savedKeywordTags.$inferSelect;

const QUERY_CHUNK_SIZE = 80;
const DELETE_PAIR_CHUNK_SIZE = 45;
const ASSIGNMENT_INSERT_CHUNK_SIZE = 40;
const REPLACE_DELETE_KEYWORD_CHUNK_SIZE = 70;

async function getTagFilterIds(params: {
  projectId: string;
  tagIds?: string[];
  tagNames?: string[];
}): Promise<{ tagIds: string[]; emptyTagNameMatch: boolean }> {
  const directTagIds = params.tagIds ?? [];
  const normalizedTags = normalizeSavedKeywordTags(params.tagNames);
  if (normalizedTags.length === 0) {
    return { tagIds: [...new Set(directTagIds)], emptyTagNameMatch: false };
  }

  const rows = await db
    .select({ id: savedKeywordTags.id })
    .from(savedKeywordTags)
    .where(
      and(
        eq(savedKeywordTags.projectId, params.projectId),
        inArray(
          savedKeywordTags.normalizedName,
          normalizedTags.map((tag) => tag.normalizedName),
        ),
      ),
    );

  return {
    tagIds: [...new Set([...directTagIds, ...rows.map((row) => row.id)])],
    emptyTagNameMatch: directTagIds.length === 0 && rows.length === 0,
  };
}

async function listSavedKeywordTagsByProject(projectId: string) {
  return db
    .select({
      id: savedKeywordTags.id,
      projectId: savedKeywordTags.projectId,
      name: savedKeywordTags.name,
      normalizedName: savedKeywordTags.normalizedName,
      color: savedKeywordTags.color,
      createdAt: savedKeywordTags.createdAt,
      keywordCount: count(savedKeywordTagAssignments.savedKeywordId),
    })
    .from(savedKeywordTags)
    .leftJoin(
      savedKeywordTagAssignments,
      eq(savedKeywordTagAssignments.tagId, savedKeywordTags.id),
    )
    .where(eq(savedKeywordTags.projectId, projectId))
    .groupBy(
      savedKeywordTags.id,
      savedKeywordTags.projectId,
      savedKeywordTags.name,
      savedKeywordTags.normalizedName,
      savedKeywordTags.color,
      savedKeywordTags.createdAt,
    )
    .orderBy(asc(savedKeywordTags.normalizedName));
}

async function listTagsBySavedKeywordIds(
  projectId: string,
  savedKeywordIds: string[],
) {
  const tagsByKeywordId = new Map<string, SavedKeywordTagRecord[]>();
  if (savedKeywordIds.length === 0) return tagsByKeywordId;

  for (let i = 0; i < savedKeywordIds.length; i += QUERY_CHUNK_SIZE) {
    const chunk = savedKeywordIds.slice(i, i + QUERY_CHUNK_SIZE);
    const rows = await db
      .select({
        savedKeywordId: savedKeywordTagAssignments.savedKeywordId,
        tag: savedKeywordTags,
      })
      .from(savedKeywordTagAssignments)
      .innerJoin(
        savedKeywordTags,
        eq(savedKeywordTags.id, savedKeywordTagAssignments.tagId),
      )
      .where(
        and(
          eq(savedKeywordTags.projectId, projectId),
          inArray(savedKeywordTagAssignments.savedKeywordId, chunk),
        ),
      )
      .orderBy(asc(savedKeywordTags.normalizedName));

    for (const { savedKeywordId, tag } of rows) {
      const tags = tagsByKeywordId.get(savedKeywordId) ?? [];
      tags.push(tag);
      tagsByKeywordId.set(savedKeywordId, tags);
    }
  }

  return tagsByKeywordId;
}

async function addTagsToSavedKeywords(params: {
  projectId: string;
  savedKeywordIds: string[];
  tagNames: string[];
}) {
  const savedKeywordRows = await listSavedKeywordRowsByIds(
    params.projectId,
    params.savedKeywordIds,
  );
  if (savedKeywordRows.length === 0) {
    return { savedKeywordCount: 0, tags: [] };
  }

  const tags = await upsertSavedKeywordTags(params.projectId, params.tagNames);

  const assignments = savedKeywordRows.flatMap((row) =>
    tags.map((tag) => ({ savedKeywordId: row.id, tagId: tag.id })),
  );
  for (let i = 0; i < assignments.length; i += ASSIGNMENT_INSERT_CHUNK_SIZE) {
    const chunk = assignments.slice(i, i + ASSIGNMENT_INSERT_CHUNK_SIZE);
    await db
      .insert(savedKeywordTagAssignments)
      .values(chunk)
      .onConflictDoNothing();
  }

  return { savedKeywordCount: savedKeywordRows.length, tags };
}

async function replaceTagsForSavedKeywords(params: {
  projectId: string;
  savedKeywordIds: string[];
  tagNames: string[];
}) {
  const addResult = await addTagsToSavedKeywords(params);
  const keepTagIds = addResult.tags.map((tag) => tag.id);
  if (addResult.savedKeywordCount === 0 || keepTagIds.length === 0) {
    return { ...addResult, removedCount: 0 };
  }

  let removedCount = 0;
  for (
    let i = 0;
    i < params.savedKeywordIds.length;
    i += REPLACE_DELETE_KEYWORD_CHUNK_SIZE
  ) {
    const chunk = params.savedKeywordIds.slice(
      i,
      i + REPLACE_DELETE_KEYWORD_CHUNK_SIZE,
    );
    const savedKeywordRows = await listSavedKeywordRowsByIds(
      params.projectId,
      chunk,
    );
    const savedKeywordIds = savedKeywordRows.map((row) => row.id);
    if (savedKeywordIds.length === 0) continue;

    const deleted = await db
      .delete(savedKeywordTagAssignments)
      .where(
        and(
          inArray(savedKeywordTagAssignments.savedKeywordId, savedKeywordIds),
          notInArray(savedKeywordTagAssignments.tagId, keepTagIds),
        ),
      )
      .returning({ id: savedKeywordTagAssignments.savedKeywordId });
    removedCount += deleted.length;
  }

  return { ...addResult, removedCount };
}

async function removeTagsFromSavedKeywords(params: {
  projectId: string;
  savedKeywordIds: string[];
  tagIds: string[];
}) {
  const [savedKeywordRows, tags] = await Promise.all([
    listSavedKeywordRowsByIds(params.projectId, params.savedKeywordIds),
    listSavedKeywordTagsByIds(params.projectId, params.tagIds),
  ]);
  const savedKeywordIds = savedKeywordRows.map((row) => row.id);
  const tagIds = tags.map((tag) => tag.id);
  let removedCount = 0;

  for (let i = 0; i < savedKeywordIds.length; i += DELETE_PAIR_CHUNK_SIZE) {
    const savedKeywordChunk = savedKeywordIds.slice(
      i,
      i + DELETE_PAIR_CHUNK_SIZE,
    );
    for (let j = 0; j < tagIds.length; j += DELETE_PAIR_CHUNK_SIZE) {
      const tagChunk = tagIds.slice(j, j + DELETE_PAIR_CHUNK_SIZE);
      const deleted = await db
        .delete(savedKeywordTagAssignments)
        .where(
          and(
            inArray(
              savedKeywordTagAssignments.savedKeywordId,
              savedKeywordChunk,
            ),
            inArray(savedKeywordTagAssignments.tagId, tagChunk),
          ),
        )
        .returning({ tagId: savedKeywordTagAssignments.tagId });
      removedCount += deleted.length;
    }
  }

  return { removedCount, savedKeywordCount: savedKeywordRows.length, tags };
}

async function removeAllTagsFromSavedKeywords(params: {
  projectId: string;
  savedKeywordIds: string[];
}) {
  const savedKeywordRows = await listSavedKeywordRowsByIds(
    params.projectId,
    params.savedKeywordIds,
  );
  let removedCount = 0;

  for (let i = 0; i < savedKeywordRows.length; i += QUERY_CHUNK_SIZE) {
    const chunk = savedKeywordRows.slice(i, i + QUERY_CHUNK_SIZE);
    const deleted = await db
      .delete(savedKeywordTagAssignments)
      .where(
        inArray(
          savedKeywordTagAssignments.savedKeywordId,
          chunk.map((row) => row.id),
        ),
      )
      .returning({ id: savedKeywordTagAssignments.savedKeywordId });
    removedCount += deleted.length;
  }

  return { removedCount, savedKeywordCount: savedKeywordRows.length };
}

async function upsertSavedKeywordTags(
  projectId: string,
  tagNames: readonly string[] | undefined,
) {
  const normalizedTags = normalizeSavedKeywordTags(tagNames);
  if (normalizedTags.length === 0) return [];

  const [first, ...rest] = normalizedTags.map((tag) =>
    db
      .insert(savedKeywordTags)
      .values({
        id: crypto.randomUUID(),
        projectId,
        name: tag.name,
        normalizedName: tag.normalizedName,
      })
      .onConflictDoNothing(),
  );
  await db.batch([first, ...rest]);

  return db
    .select()
    .from(savedKeywordTags)
    .where(
      and(
        eq(savedKeywordTags.projectId, projectId),
        inArray(
          savedKeywordTags.normalizedName,
          normalizedTags.map((tag) => tag.normalizedName),
        ),
      ),
    )
    .orderBy(asc(savedKeywordTags.normalizedName));
}

async function listSavedKeywordRowsByIds(
  projectId: string,
  savedKeywordIds: string[],
) {
  const rows: (typeof savedKeywords.$inferSelect)[] = [];
  for (let i = 0; i < savedKeywordIds.length; i += QUERY_CHUNK_SIZE) {
    const chunk = savedKeywordIds.slice(i, i + QUERY_CHUNK_SIZE);
    rows.push(
      ...(await db
        .select()
        .from(savedKeywords)
        .where(
          and(
            eq(savedKeywords.projectId, projectId),
            inArray(savedKeywords.id, chunk),
          ),
        )),
    );
  }
  return rows;
}

async function listSavedKeywordTagsByIds(projectId: string, tagIds: string[]) {
  if (tagIds.length === 0) return [];
  const rows: SavedKeywordTagRecord[] = [];
  for (let i = 0; i < tagIds.length; i += QUERY_CHUNK_SIZE) {
    const chunk = tagIds.slice(i, i + QUERY_CHUNK_SIZE);
    rows.push(
      ...(await db
        .select()
        .from(savedKeywordTags)
        .where(
          and(
            eq(savedKeywordTags.projectId, projectId),
            inArray(savedKeywordTags.id, chunk),
          ),
        )),
    );
  }
  return rows;
}

async function updateSavedKeywordTag(params: {
  projectId: string;
  tagId: string;
  name?: string;
  color?: string | null;
}) {
  const updates: Partial<typeof savedKeywordTags.$inferInsert> = {};
  if (params.name !== undefined) {
    const normalizedTag = normalizeSavedKeywordTag(params.name);
    if (!normalizedTag) return null;
    updates.name = normalizedTag.name;
    updates.normalizedName = normalizedTag.normalizedName;
  }
  if (params.color !== undefined) {
    updates.color = params.color;
  }
  if (Object.keys(updates).length === 0) return null;

  const [updated] = await db
    .update(savedKeywordTags)
    .set(updates)
    .where(
      and(
        eq(savedKeywordTags.projectId, params.projectId),
        eq(savedKeywordTags.id, params.tagId),
      ),
    )
    .returning();
  return updated ?? null;
}

async function deleteSavedKeywordTag(params: {
  projectId: string;
  tagId: string;
}): Promise<
  | { status: "deleted" }
  | { status: "not_found" }
  | { status: "in_use"; assignmentCount: number }
> {
  const [tag] = await db
    .select({ id: savedKeywordTags.id })
    .from(savedKeywordTags)
    .where(
      and(
        eq(savedKeywordTags.projectId, params.projectId),
        eq(savedKeywordTags.id, params.tagId),
      ),
    );
  if (!tag) return { status: "not_found" };

  // Guard: refuse to delete a tag that's still attached to saved keywords.
  // FK cascade would otherwise silently drop assignments.
  const [{ value: assignmentCount } = { value: 0 }] = await db
    .select({ value: count() })
    .from(savedKeywordTagAssignments)
    .where(eq(savedKeywordTagAssignments.tagId, params.tagId));

  if (assignmentCount > 0) {
    return { status: "in_use", assignmentCount };
  }

  const deleted = await db
    .delete(savedKeywordTags)
    .where(
      and(
        eq(savedKeywordTags.projectId, params.projectId),
        eq(savedKeywordTags.id, params.tagId),
      ),
    )
    .returning({ id: savedKeywordTags.id });
  return deleted.length > 0 ? { status: "deleted" } : { status: "not_found" };
}

export const SavedKeywordTagsRepository = {
  getTagFilterIds,
  listSavedKeywordTagsByProject,
  listTagsBySavedKeywordIds,
  addTagsToSavedKeywords,
  replaceTagsForSavedKeywords,
  removeTagsFromSavedKeywords,
  removeAllTagsFromSavedKeywords,
  updateSavedKeywordTag,
  deleteSavedKeywordTag,
} as const;
