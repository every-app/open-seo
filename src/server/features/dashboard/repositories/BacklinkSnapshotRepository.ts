import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { backlinkSnapshots } from "@/db/schema";

type BacklinkSnapshot = typeof backlinkSnapshots.$inferSelect;

async function getLatestForProject(
  projectId: string,
): Promise<BacklinkSnapshot | null> {
  const rows = await db
    .select()
    .from(backlinkSnapshots)
    .where(eq(backlinkSnapshots.projectId, projectId))
    // id, not capturedAt: autoincrement is monotonic and immune to the
    // sqlite-vs-pg timestamp text-format difference.
    .orderBy(desc(backlinkSnapshots.id))
    .limit(1);
  return rows[0] ?? null;
}

async function insert(
  values: typeof backlinkSnapshots.$inferInsert,
): Promise<BacklinkSnapshot> {
  const [row] = await db.insert(backlinkSnapshots).values(values).returning();
  if (!row) {
    throw new Error("Failed to insert backlink_snapshot");
  }
  return row;
}

async function getFreshForProjectDomain(params: {
  projectId: string;
  domain: string;
  maxAgeMs: number;
  now?: number;
}): Promise<BacklinkSnapshot | null> {
  const rows = await db
    .select()
    .from(backlinkSnapshots)
    .where(
      and(
        eq(backlinkSnapshots.projectId, params.projectId),
        eq(backlinkSnapshots.domain, params.domain),
      ),
    )
    .orderBy(desc(backlinkSnapshots.id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const capturedMs = Date.parse(row.capturedAt);
  if (
    !Number.isFinite(capturedMs) ||
    (params.now ?? Date.now()) - capturedMs >= params.maxAgeMs
  ) {
    return null;
  }
  return row;
}

export const BacklinkSnapshotRepository = {
  getLatestForProject,
  getFreshForProjectDomain,
  insert,
};
