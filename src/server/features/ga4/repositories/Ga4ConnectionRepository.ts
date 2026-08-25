import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ga4Connections } from "@/db/schema";

export type Ga4Connection = typeof ga4Connections.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<Ga4Connection | null> {
  const rows = await db
    .select()
    .from(ga4Connections)
    .where(eq(ga4Connections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  propertyId: string;
  propertyDisplayName: string;
  propertyTimeZone: string;
  propertyCurrencyCode: string;
  connectedByUserId: string;
  ga4AccountId: string;
  connectedAccountEmail: string | null;
}): Promise<Ga4Connection> {
  const [row] = await db
    .insert(ga4Connections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: ga4Connections.projectId,
      set: {
        organizationId: input.organizationId,
        propertyId: input.propertyId,
        propertyDisplayName: input.propertyDisplayName,
        propertyTimeZone: input.propertyTimeZone,
        propertyCurrencyCode: input.propertyCurrencyCode,
        connectedByUserId: input.connectedByUserId,
        ga4AccountId: input.ga4AccountId,
        connectedAccountEmail: sql`case
          when ${ga4Connections.connectedByUserId} = ${input.connectedByUserId}
            and ${ga4Connections.ga4AccountId} = ${input.ga4AccountId}
          then coalesce(${input.connectedAccountEmail}, ${ga4Connections.connectedAccountEmail})
          else ${input.connectedAccountEmail}
        end`,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert ga4_connection");
  return row;
}

async function deleteByProjectId(projectId: string): Promise<void> {
  await db
    .delete(ga4Connections)
    .where(eq(ga4Connections.projectId, projectId));
}

async function existsForConnectorAccount(
  userId: string,
  ga4AccountId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: ga4Connections.id })
    .from(ga4Connections)
    .where(
      and(
        eq(ga4Connections.connectedByUserId, userId),
        eq(ga4Connections.ga4AccountId, ga4AccountId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export const Ga4ConnectionRepository = {
  getByProjectId,
  upsert,
  deleteByProjectId,
  existsForConnectorAccount,
};
