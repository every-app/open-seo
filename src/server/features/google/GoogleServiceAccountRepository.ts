import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { googleServiceAccounts, gscConnections } from "@/db/schema";

async function listForOrganization(organizationId: string) {
  return db
    .select({
      id: googleServiceAccounts.id,
      clientEmail: googleServiceAccounts.clientEmail,
      createdAt: googleServiceAccounts.createdAt,
    })
    .from(googleServiceAccounts)
    .where(eq(googleServiceAccounts.organizationId, organizationId))
    .orderBy(googleServiceAccounts.createdAt);
}

async function getForOrganization(input: {
  organizationId: string;
  id: string;
}) {
  const [row] = await db
    .select()
    .from(googleServiceAccounts)
    .where(
      and(
        eq(googleServiceAccounts.id, input.id),
        eq(googleServiceAccounts.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function getById(id: string) {
  const [row] = await db
    .select()
    .from(googleServiceAccounts)
    .where(eq(googleServiceAccounts.id, id))
    .limit(1);
  return row ?? null;
}

/** Re-uploading a key for the same client email replaces the stored key, so
 *  rotating a key keeps the projects that use it connected. */
async function upsert(input: {
  organizationId: string;
  clientEmail: string;
  privateKeyId: string | null;
  encryptedPrivateKey: string;
  createdByUserId: string;
}) {
  const [row] = await db
    .insert(googleServiceAccounts)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: [
        googleServiceAccounts.organizationId,
        googleServiceAccounts.clientEmail,
      ],
      set: {
        privateKeyId: input.privateKeyId,
        encryptedPrivateKey: input.encryptedPrivateKey,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning({
      id: googleServiceAccounts.id,
      clientEmail: googleServiceAccounts.clientEmail,
      createdAt: googleServiceAccounts.createdAt,
    });
  if (!row) throw new Error("Failed to save google_service_account");
  return row;
}

async function countConnections(input: { organizationId: string; id: string }) {
  const [result] = await db
    .select({ projectCount: count() })
    .from(gscConnections)
    .where(
      and(
        eq(gscConnections.serviceAccountId, input.id),
        eq(gscConnections.organizationId, input.organizationId),
      ),
    );
  return result?.projectCount ?? 0;
}

async function listConnectedProjectIds(input: {
  organizationId: string;
  id: string;
}) {
  const rows = await db
    .select({ projectId: gscConnections.projectId })
    .from(gscConnections)
    .where(
      and(
        eq(gscConnections.serviceAccountId, input.id),
        eq(gscConnections.organizationId, input.organizationId),
      ),
    );
  return rows.map((row) => row.projectId);
}

/** Deleting the key cascades to the project connections that used it. */
async function remove(input: { organizationId: string; id: string }) {
  await db
    .delete(gscConnections)
    .where(
      and(
        eq(gscConnections.serviceAccountId, input.id),
        eq(gscConnections.organizationId, input.organizationId),
      ),
    );
  await db
    .delete(googleServiceAccounts)
    .where(
      and(
        eq(googleServiceAccounts.id, input.id),
        eq(googleServiceAccounts.organizationId, input.organizationId),
      ),
    );
}

export const GoogleServiceAccountRepository = {
  listForOrganization,
  getForOrganization,
  getById,
  upsert,
  countConnections,
  listConnectedProjectIds,
  remove,
};
