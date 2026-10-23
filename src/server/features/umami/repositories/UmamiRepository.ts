import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { umamiConnections, umamiInstances } from "@/db/schema";
import type { UmamiAuthType } from "@/shared/umami";

export type UmamiInstance = typeof umamiInstances.$inferSelect;
export type UmamiConnection = typeof umamiConnections.$inferSelect;

async function listInstances(organizationId: string): Promise<UmamiInstance[]> {
  return db
    .select()
    .from(umamiInstances)
    .where(eq(umamiInstances.organizationId, organizationId))
    .orderBy(umamiInstances.createdAt);
}

async function getInstance(
  organizationId: string,
  instanceId: string,
): Promise<UmamiInstance | null> {
  const rows = await db
    .select()
    .from(umamiInstances)
    .where(
      and(
        eq(umamiInstances.organizationId, organizationId),
        eq(umamiInstances.id, instanceId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** The instance a new login replaces: same server, same auth type, same
 *  user. Saving the same login twice updates it instead of adding a copy. */
async function findMatchingInstance(input: {
  organizationId: string;
  baseUrl: string;
  authType: UmamiAuthType;
  username: string | null;
}): Promise<UmamiInstance | null> {
  const rows = await db
    .select()
    .from(umamiInstances)
    .where(
      and(
        eq(umamiInstances.organizationId, input.organizationId),
        eq(umamiInstances.baseUrl, input.baseUrl),
        eq(umamiInstances.authType, input.authType),
        input.username === null
          ? isNull(umamiInstances.username)
          : eq(umamiInstances.username, input.username),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function insertInstance(input: {
  organizationId: string;
  baseUrl: string;
  authType: UmamiAuthType;
  username: string | null;
  encryptedSecret: string;
  encryptedHeaders: string | null;
  savedByUserId: string;
}): Promise<UmamiInstance> {
  const [row] = await db
    .insert(umamiInstances)
    .values({ id: crypto.randomUUID(), ...input })
    .returning();
  if (!row) throw new Error("Failed to insert umami_instance");
  return row;
}

async function updateInstanceCredentials(input: {
  organizationId: string;
  instanceId: string;
  encryptedSecret: string;
  encryptedHeaders: string | null;
  savedByUserId: string;
}): Promise<UmamiInstance | null> {
  const [row] = await db
    .update(umamiInstances)
    .set({
      encryptedSecret: input.encryptedSecret,
      encryptedHeaders: input.encryptedHeaders,
      savedByUserId: input.savedByUserId,
      updatedAt: sql`(current_timestamp)`,
    })
    .where(
      and(
        eq(umamiInstances.organizationId, input.organizationId),
        eq(umamiInstances.id, input.instanceId),
      ),
    )
    .returning();
  return row ?? null;
}

/** Deleting an instance cascades to every project connection that uses it. */
async function deleteInstance(
  organizationId: string,
  instanceId: string,
): Promise<void> {
  await db
    .delete(umamiInstances)
    .where(
      and(
        eq(umamiInstances.organizationId, organizationId),
        eq(umamiInstances.id, instanceId),
      ),
    );
}

async function getConnection(
  projectId: string,
): Promise<UmamiConnection | null> {
  const rows = await db
    .select()
    .from(umamiConnections)
    .where(eq(umamiConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

/** The project's connection together with the instance it reads from. */
async function getConnectionWithInstance(projectId: string) {
  const rows = await db
    .select({ connection: umamiConnections, instance: umamiInstances })
    .from(umamiConnections)
    .innerJoin(
      umamiInstances,
      and(
        eq(umamiInstances.id, umamiConnections.instanceId),
        eq(umamiInstances.organizationId, umamiConnections.organizationId),
      ),
    )
    .where(eq(umamiConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsertConnection(input: {
  projectId: string;
  organizationId: string;
  instanceId: string;
  websiteId: string;
  websiteName: string;
  websiteDomain: string | null;
  timeZone: string;
  connectedByUserId: string;
}): Promise<UmamiConnection> {
  const [row] = await db
    .insert(umamiConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: umamiConnections.projectId,
      set: {
        organizationId: input.organizationId,
        instanceId: input.instanceId,
        websiteId: input.websiteId,
        websiteName: input.websiteName,
        websiteDomain: input.websiteDomain,
        timeZone: input.timeZone,
        connectedByUserId: input.connectedByUserId,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert umami_connection");
  return row;
}

async function deleteConnection(projectId: string): Promise<void> {
  await db
    .delete(umamiConnections)
    .where(eq(umamiConnections.projectId, projectId));
}

export const UmamiRepository = {
  listInstances,
  getInstance,
  findMatchingInstance,
  insertInstance,
  updateInstanceCredentials,
  deleteInstance,
  getConnection,
  getConnectionWithInstance,
  upsertConnection,
  deleteConnection,
};
