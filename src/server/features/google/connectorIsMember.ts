import { and, eq, exists, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { member, type ga4Connections, type gscConnections } from "@/db/schema";
import { usesBetterAuthServer } from "@/server/lib/runtime-env";

/**
 * A project's Search Console or GA4 connection reads Google through the grant
 * of the member who made it, so it only counts while that member is still in
 * the organization. Removing a member deletes their connections
 * (GoogleAccountService.disconnectMember); this is the check at read time, for
 * a connection that outlived its member anyway, such as one whose member left
 * before that cleanup existed. Modes without member rows (no login, Cloudflare
 * Access, Every App) have nobody to leave, so they filter nothing.
 */
export async function connectorIsMember(
  connections: typeof gscConnections | typeof ga4Connections,
): Promise<SQL | undefined> {
  if (!(await usesBetterAuthServer())) return undefined;
  return exists(
    db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.userId, connections.connectedByUserId),
          eq(member.organizationId, connections.organizationId),
        ),
      ),
  );
}
