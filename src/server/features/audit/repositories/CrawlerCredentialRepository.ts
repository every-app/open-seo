import { and, asc, eq, getTableColumns, inArray, isNull } from "drizzle-orm";
import { sortBy } from "remeda";
import { db } from "@/db";
import { crawlerCredentials, projects } from "@/db/schema";

// Credentials live on a project, and the organization owns the projects.
// Archived projects are hidden everywhere, so their credentials are too.
function inOrganization(organizationId: string) {
  return and(
    eq(projects.organizationId, organizationId),
    isNull(projects.archivedAt),
  );
}

/**
 * Looks across every project in the organization, so a store audited from a
 * second project still finds the signature saved on the first. The host match
 * is exact, because Shopify scopes a signature to one domain. Returns every
 * match, the audited project's own row first, so the caller can skip an
 * expired row in favour of a live one on another project.
 */
async function findForOrganizationAndHost(
  organizationId: string,
  projectId: string,
  host: string,
) {
  const rows = await db
    .select(getTableColumns(crawlerCredentials))
    .from(crawlerCredentials)
    .innerJoin(projects, eq(projects.id, crawlerCredentials.projectId))
    .where(
      and(inOrganization(organizationId), eq(crawlerCredentials.host, host)),
    );

  return sortBy(rows, (row) => row.projectId !== projectId);
}

async function listForOrganization(organizationId: string) {
  return db
    .select(getTableColumns(crawlerCredentials))
    .from(crawlerCredentials)
    .innerJoin(projects, eq(projects.id, crawlerCredentials.projectId))
    .where(inOrganization(organizationId))
    .orderBy(asc(crawlerCredentials.host));
}

async function upsert(input: {
  id: string;
  projectId: string;
  host: string;
  provider: "shopify";
  signatureInput: string;
  signature: string;
  expiresAt: string | null;
  createdByUserId: string | null;
}) {
  // Explicit on insert too: the D1 column default is "YYYY-MM-DD HH:MM:SS",
  // which Date parses as local time, while the update branch writes ISO.
  const createdAt = new Date().toISOString();
  await db
    .insert(crawlerCredentials)
    .values({ ...input, createdAt })
    .onConflictDoUpdate({
      target: [crawlerCredentials.projectId, crawlerCredentials.host],
      set: {
        provider: input.provider,
        signatureInput: input.signatureInput,
        signature: input.signature,
        expiresAt: input.expiresAt,
        createdByUserId: input.createdByUserId,
        createdAt,
      },
    });
}

async function remove(organizationId: string, id: string) {
  await db
    .delete(crawlerCredentials)
    .where(
      and(
        eq(crawlerCredentials.id, id),
        inArray(
          crawlerCredentials.projectId,
          db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.organizationId, organizationId)),
        ),
      ),
    );
}

export const CrawlerCredentialRepository = {
  findForOrganizationAndHost,
  listForOrganization,
  upsert,
  remove,
} as const;
