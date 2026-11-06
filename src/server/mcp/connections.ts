import { sortBy } from "remeda";
import { z } from "zod";
import { GuestAccountRepository } from "@/server/auth/repositories/GuestAccountRepository";
import { getCapturedOAuthHelpers } from "@/server/mcp/oauth-provider";
import { getWebChat } from "@/server/mcp/web-chat";

// The OAuth grants behind "Connected agents" in Settings. Grants live under
// the KV key grant:{userId}:{grantId}, so listUserGrants and revokeGrant can
// only ever reach the caller's own grants.

const grantMetadataSchema = z.looseObject({
  organizationId: z.string().optional(),
});

// A claimed guest's grant stays filed under the deleted guest user while it
// acts as the account that claimed it (transport.ts), so that account owns it
// too: it lists and revokes it like its own.
async function grantOwnerIds(userId: string) {
  return [
    userId,
    ...(await GuestAccountRepository.listClaimedGuestUserIds(userId)),
  ];
}

async function listMcpConnections(userId: string) {
  const oauth = getCapturedOAuthHelpers();
  // One page each: a person has a handful of agents, and a page holds a
  // thousand.
  const pages = await Promise.all(
    (await grantOwnerIds(userId)).map((ownerId) =>
      oauth.listUserGrants(ownerId),
    ),
  );
  const grants = pages.flatMap((page) => page.items);

  const connections = await Promise.all(
    grants.map(async (grant) => {
      const client = await oauth.lookupClient(grant.clientId);
      return {
        id: grant.id,
        clientName: client?.clientName ?? "MCP client",
        webChat: getWebChat(client?.redirectUris ?? []),
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
  const oauth = getCapturedOAuthHelpers();
  // The grant id names one grant under one owner; revoking it under the
  // others finds nothing to delete.
  await Promise.all(
    (await grantOwnerIds(userId)).map((ownerId) =>
      oauth.revokeGrant(grantId, ownerId),
    ),
  );
}

export const McpConnectionsService = {
  listMcpConnections,
  revokeMcpConnection,
};
