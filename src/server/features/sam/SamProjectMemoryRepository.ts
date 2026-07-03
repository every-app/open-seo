import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { samProjectMemory } from "@/db/schema";

// Backing store for SAM's writable context blocks ("memory", "research_log").
// One row per (project, label); every chat session DO in a project reads and
// writes the same rows, which is what makes the memory project-scoped instead
// of per-conversation.

async function getBlock(
  projectId: string,
  label: string,
): Promise<string | null> {
  const [row] = await db
    .select({ content: samProjectMemory.content })
    .from(samProjectMemory)
    .where(
      and(
        eq(samProjectMemory.projectId, projectId),
        eq(samProjectMemory.label, label),
      ),
    )
    .limit(1);
  return row?.content ?? null;
}

async function setBlock(
  projectId: string,
  label: string,
  content: string,
): Promise<void> {
  await db
    .insert(samProjectMemory)
    .values({ projectId, label, content })
    .onConflictDoUpdate({
      target: [samProjectMemory.projectId, samProjectMemory.label],
      set: { content, updatedAt: new Date().toISOString() },
    });
}

export const SamProjectMemoryRepository = {
  getBlock,
  setBlock,
} as const;
