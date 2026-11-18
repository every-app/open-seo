import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { member, projectEmbeds, projects, user } from "@/db/schema";

async function getTokenForProject(projectId: string) {
  const [row] = await db
    .select({ token: projectEmbeds.token })
    .from(projectEmbeds)
    .where(eq(projectEmbeds.projectId, projectId))
    .limit(1);
  return row?.token ?? null;
}

/** Keeps the first link when two members turn it on at once. */
async function insertLink(params: {
  projectId: string;
  token: string;
  userId: string;
}) {
  await db
    .insert(projectEmbeds)
    .values({
      projectId: params.projectId,
      token: params.token,
      createdByUserId: params.userId,
    })
    .onConflictDoNothing();
}

async function deleteLink(projectId: string) {
  await db.delete(projectEmbeds).where(eq(projectEmbeds.projectId, projectId));
}

/**
 * The public read path. The creator's membership is joined in, so a link whose
 * creator has left the organization reads as having no role.
 */
async function getLinkByToken(token: string) {
  const [row] = await db
    .select({
      projectId: projectEmbeds.projectId,
      organizationId: projects.organizationId,
      archivedAt: projects.archivedAt,
      userId: projectEmbeds.createdByUserId,
      userEmail: user.email,
      role: member.role,
    })
    .from(projectEmbeds)
    .innerJoin(projects, eq(projects.id, projectEmbeds.projectId))
    .innerJoin(user, eq(user.id, projectEmbeds.createdByUserId))
    .leftJoin(
      member,
      and(
        eq(member.userId, projectEmbeds.createdByUserId),
        eq(member.organizationId, projects.organizationId),
      ),
    )
    .where(eq(projectEmbeds.token, token))
    .limit(1);
  return row ?? null;
}

export const EmbedRepository = {
  getTokenForProject,
  insertLink,
  deleteLink,
  getLinkByToken,
};
