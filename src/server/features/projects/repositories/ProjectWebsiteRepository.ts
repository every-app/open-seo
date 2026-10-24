import { and, eq, isNull, sql } from "drizzle-orm";
import { chunk } from "remeda";
import { runBatch } from "@/db/runBatch";
import {
  projects,
  projectContextSections,
  projectCompetitors,
} from "@/db/schema";
import type { SaveProjectWebsiteSetup } from "@/types/schemas/projectWebsite";
import type { ContextAuthor } from "@/types/schemas/projectContext";
import {
  writeConfiguration,
  writeResearchKeywords,
  type ConfigurationRows,
} from "@/server/features/ai-visibility/repositories/aiVisibilityConfigurationRepository";

// workerd's SQLite (D1, including local D1 in the Docker image) caps compound
// SELECTs at 5 terms (SQLITE_LIMIT_COMPOUND_SELECT), and each competitor row
// below is one `union all` term.
const COMPETITOR_INSERT_CHUNK_SIZE = 5;

export async function saveWebsiteSetup(
  organizationId: string,
  input: SaveProjectWebsiteSetup,
  author: ContextAuthor,
  tracking: ConfigurationRows | null,
) {
  const updatedAt = new Date().toISOString();
  const competitors = input.competitors.map((row) => ({
    ...row,
    id: crypto.randomUUID(),
  }));
  // These literals are server-generated UUIDs, never user input. Inlining
  // them keeps the list guard below D1's bound-parameter limit for 100 rows.
  const insertedIds = sql.raw(competitors.map(({ id }) => `'${id}'`).join(","));
  await runBatch((tx) => [
    tx
      .update(projects)
      .set({
        domain: sql`coalesce(${projects.domain}, ${input.domain})`,
      })
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.organizationId, organizationId),
          isNull(projects.archivedAt),
        ),
      ),
    // Insert-only writes also preserve edits made after the service read.
    tx
      .insert(projectContextSections)
      .values({
        projectId: input.projectId,
        key: "business_overview",
        title: null,
        content: input.overview,
        updatedBy: author,
        updatedAt,
      })
      .onConflictDoNothing(),
    ...chunk(competitors, COMPETITOR_INSERT_CHUNK_SIZE).map((rows) =>
      tx
        .insert(projectCompetitors)
        .select(
          sql`
          select * from (${sql.join(
            rows.map(
              ({ id, domain, name, notes }) =>
                sql`select ${id}, ${input.projectId}, ${domain}, ${name}, ${notes}, ${updatedAt}, ${author}`,
            ),
            sql` union all `,
          )}) as researched_competitors
          where not exists (
            select 1 from ${projectCompetitors}
            where ${projectCompetitors.projectId} = ${input.projectId}
              and ${projectCompetitors.id} not in (${insertedIds})
          )
        `,
        )
        .onConflictDoNothing(),
    ),
    ...(tracking ? writeConfiguration(tx, tracking) : []),
    // Keyword writes fill an empty field; existing research stays intact.
    ...(input.suggestedTopics?.length
      ? writeResearchKeywords(tx, input.projectId, [
          ...input.suggestedTopics.map((topic) => topic.name),
          ...(input.suggestedKeywords ?? []),
        ])
      : []),
  ]);
}
