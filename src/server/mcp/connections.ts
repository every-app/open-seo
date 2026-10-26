import { sortBy } from "remeda";
import { z } from "zod";
import { getCapturedOAuthHelpers } from "@/server/mcp/oauth-provider";

// The OAuth grants behind "Connected agents" in Settings. Grants live under
// the KV key grant:{userId}:{grantId}, so listUserGrants and revokeGrant can
// only ever reach the caller's own grants.

const grantMetadataSchema = z.looseObject({
  organizationId: z.string().optional(),
});

async function listMcpConnections(userId: string) {
  const oauth = getCapturedOAuthHelpers();
  // One page: a person has a handful of agents, and a page holds a thousand.
  const { items: grants } = await oauth.listUserGrants(userId);

  const connections = await Promise.all(
    grants.map(async (grant) => {
      const client = await oauth.lookupClient(grant.clientId);
      return {
        id: grant.id,
        clientName: client?.clientName ?? "MCP client",
        // The provider stores Unix seconds.
        createdAt: grant.createdAt * 1000,
        // Named on the client from the organizations the user belongs to,
        // the same way the API keys table does it.
        organizationId:
          grantMetadataSchema.safeParse(grant.metadata).data?.organizationId ??
          null,
      };
    }),
  );

  return sortBy(connections, [(connection) => connection.createdAt, "desc"]);
}

// Deletes the grant and every access token under it; the client's next call
// gets 401 and it has to authorize again.
async function revokeMcpConnection(userId: string, grantId: string) {
  await getCapturedOAuthHelpers().revokeGrant(grantId, userId);
}

export const McpConnectionsService = {
  listMcpConnections,
  revokeMcpConnection,
};
