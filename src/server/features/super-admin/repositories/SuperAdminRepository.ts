import { and, countDistinct, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invitation, member, organization, projects } from "@/db/schema";

async function listClients() {
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      memberCount: countDistinct(member.id),
      projectCount: countDistinct(projects.id),
      pendingInvitationCount: countDistinct(invitation.id),
    })
    .from(organization)
    .leftJoin(member, eq(member.organizationId, organization.id))
    .leftJoin(
      projects,
      and(
        eq(projects.organizationId, organization.id),
        isNull(projects.archivedAt),
      ),
    )
    .leftJoin(
      invitation,
      and(
        eq(invitation.organizationId, organization.id),
        eq(invitation.status, "pending"),
      ),
    )
    .groupBy(
      organization.id,
      organization.name,
      organization.slug,
      organization.createdAt,
    )
    .orderBy(desc(organization.createdAt), desc(organization.id));

  return rows.map((row) => ({
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
  }));
}

export const SuperAdminRepository = { listClients };
