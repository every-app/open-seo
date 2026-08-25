import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import type { runBatch } from "@/db/runBatch";
import {
  projectCompetitors,
  projectContextSections,
  projectKeyPages,
  projectResearchLog,
} from "@/db/schema";
import type {
  ContextAuthor,
  KeyPageRole,
} from "@/types/schemas/projectContext";

// Backing store for project memory. Every surface (settings UI, MCP tools, SAM)
// reads and writes these same rows through ProjectContextService. Reads execute
// directly; writes are statement builders the service runs atomically inside
// one `runBatch`, so a failing op can't leave the project half-updated.

type Tx = Parameters<Parameters<typeof runBatch>[0]>[0];

type CompetitorRow = {
  domain: string;
  name: string | null;
  notes: string | null;
};

type KeyPageRow = {
  url: string;
  // null = caller omitted the role: keep the stored classification on upsert
  // (a user's hand-set "money page" must survive an agent re-add).
  role: KeyPageRole | null;
  topic: string | null;
  notes: string | null;
};

// D1 caps bound parameters per statement, so multi-row writes are chunked into
// several statements within the same atomic batch.
const ROWS_PER_INSERT = 10;
const VALUES_PER_DELETE = 90;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function listSections(projectId: string) {
  return db
    .select()
    .from(projectContextSections)
    .where(eq(projectContextSections.projectId, projectId))
    .orderBy(asc(projectContextSections.key));
}

function upsertSection(
  tx: Tx,
  params: {
    projectId: string;
    key: string;
    title: string | null;
    content: string;
    updatedBy: ContextAuthor;
  },
) {
  const updatedAt = new Date().toISOString();
  return tx
    .insert(projectContextSections)
    .values({ ...params, updatedAt })
    .onConflictDoUpdate({
      target: [projectContextSections.projectId, projectContextSections.key],
      set: {
        // A title is only sent when the caller renames a custom section, so an
        // omitted one keeps the stored name.
        title: sql`coalesce(excluded.title, ${projectContextSections.title})`,
        content: params.content,
        updatedAt,
        updatedBy: params.updatedBy,
      },
    });
}

function deleteSection(tx: Tx, projectId: string, key: string) {
  return tx
    .delete(projectContextSections)
    .where(
      and(
        eq(projectContextSections.projectId, projectId),
        eq(projectContextSections.key, key),
      ),
    );
}

async function listCompetitors(projectId: string) {
  return db
    .select()
    .from(projectCompetitors)
    .where(eq(projectCompetitors.projectId, projectId))
    .orderBy(asc(projectCompetitors.domain));
}

// Upsert by (project, domain). Fields the caller omitted keep their stored
// value — an agent adding a domain it already knows must not wipe the notes a
// user wrote.
function upsertCompetitors(
  tx: Tx,
  projectId: string,
  rows: CompetitorRow[],
  updatedBy: ContextAuthor,
) {
  const updatedAt = new Date().toISOString();
  return chunk(rows, ROWS_PER_INSERT).map((rowChunk) =>
    tx
      .insert(projectCompetitors)
      .values(
        rowChunk.map((row) => ({
          id: crypto.randomUUID(),
          projectId,
          ...row,
          updatedAt,
          updatedBy,
        })),
      )
      .onConflictDoUpdate({
        target: [projectCompetitors.projectId, projectCompetitors.domain],
        set: {
          name: sql`coalesce(excluded.name, ${projectCompetitors.name})`,
          notes: sql`coalesce(excluded.notes, ${projectCompetitors.notes})`,
          updatedAt,
          updatedBy,
        },
      }),
  );
}

function deleteCompetitors(tx: Tx, projectId: string, domains: string[]) {
  return chunk(domains, VALUES_PER_DELETE).map((domainChunk) =>
    tx
      .delete(projectCompetitors)
      .where(
        and(
          eq(projectCompetitors.projectId, projectId),
          inArray(projectCompetitors.domain, domainChunk),
        ),
      ),
  );
}

async function listKeyPages(projectId: string) {
  return db
    .select()
    .from(projectKeyPages)
    .where(eq(projectKeyPages.projectId, projectId))
    .orderBy(asc(projectKeyPages.url));
}

function upsertKeyPages(
  tx: Tx,
  projectId: string,
  rows: KeyPageRow[],
  updatedBy: ContextAuthor,
) {
  const updatedAt = new Date().toISOString();
  const buildInsert = (rowChunk: KeyPageRow[], setRole: boolean) =>
    tx
      .insert(projectKeyPages)
      .values(
        rowChunk.map((row) => ({
          id: crypto.randomUUID(),
          projectId,
          ...row,
          // New rows need a concrete role; existing rows keep theirs below.
          role: row.role ?? "other",
          updatedAt,
          updatedBy,
        })),
      )
      .onConflictDoUpdate({
        target: [projectKeyPages.projectId, projectKeyPages.url],
        set: {
          // Omitting the role from the SET keeps the stored classification.
          ...(setRole ? { role: sql`excluded.role` } : {}),
          topic: sql`coalesce(excluded.topic, ${projectKeyPages.topic})`,
          notes: sql`coalesce(excluded.notes, ${projectKeyPages.notes})`,
          updatedAt,
          updatedBy,
        },
      });

  const withRole = rows.filter((row) => row.role !== null);
  const withoutRole = rows.filter((row) => row.role === null);
  return [
    ...chunk(withRole, ROWS_PER_INSERT).map((c) => buildInsert(c, true)),
    ...chunk(withoutRole, ROWS_PER_INSERT).map((c) => buildInsert(c, false)),
  ];
}

function deleteKeyPages(tx: Tx, projectId: string, urls: string[]) {
  return chunk(urls, VALUES_PER_DELETE).map((urlChunk) =>
    tx
      .delete(projectKeyPages)
      .where(
        and(
          eq(projectKeyPages.projectId, projectId),
          inArray(projectKeyPages.url, urlChunk),
        ),
      ),
  );
}

async function listResearchLog(projectId: string, limit: number) {
  return db
    .select()
    .from(projectResearchLog)
    .where(eq(projectResearchLog.projectId, projectId))
    .orderBy(
      desc(projectResearchLog.createdAt),
      desc(projectResearchLog.entryDate),
      desc(projectResearchLog.id),
    )
    .limit(limit);
}

function appendResearchLogEntry(
  tx: Tx,
  params: {
    projectId: string;
    entryDate: string;
    summary: string;
    createdBy: ContextAuthor;
  },
) {
  // createdAt is stamped here, not left to the column default: the dialects'
  // defaults render different string formats (and second/tx granularity),
  // which would break the lexicographic ORDER BY created_at in listResearchLog.
  return tx.insert(projectResearchLog).values({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...params,
  });
}

function deleteResearchLogEntries(tx: Tx, projectId: string, ids: string[]) {
  return chunk(ids, VALUES_PER_DELETE).map((idChunk) =>
    tx
      .delete(projectResearchLog)
      .where(
        and(
          eq(projectResearchLog.projectId, projectId),
          inArray(projectResearchLog.id, idChunk),
        ),
      ),
  );
}

function pruneResearchLogBefore(tx: Tx, projectId: string, entryDate: string) {
  return tx
    .delete(projectResearchLog)
    .where(
      and(
        eq(projectResearchLog.projectId, projectId),
        lt(projectResearchLog.entryDate, entryDate),
      ),
    );
}

export const ProjectContextRepository = {
  listSections,
  upsertSection,
  deleteSection,
  listCompetitors,
  upsertCompetitors,
  deleteCompetitors,
  listKeyPages,
  upsertKeyPages,
  deleteKeyPages,
  listResearchLog,
  appendResearchLogEntry,
  deleteResearchLogEntries,
  pruneResearchLogBefore,
} as const;
