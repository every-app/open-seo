import { sortBy } from "remeda";
import { z } from "zod";
import { GuestAccountRepository } from "@/server/auth/repositories/GuestAccountRepository";
import { getCapturedOAuthHelpers } from "@/server/mcp/oauth-provider";
import { getWebChat } from "@/server/mcp/web-chat";
import {
  disconnectStripeConnection,
  listStripeConnections,
} from "@/server/stripe-projects/service";

// "Connected agents" in Settings: OAuth grants plus Stripe Projects links.
// OAuth grants live under the KV key grant:{userId}:{grantId}, so
// listUserGrants and revokeGrant can only ever reach the caller's own grants;
// Stripe links are queried by the caller's user id the same way.

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

  const oauthConnections = await Promise.all(
    grants.map(async (grant) => {
      const client = await oauth.lookupClient(grant.clientId);
      return {
        kind: "oauth" as const,
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

  const stripeConnections = (await listStripeConnections(userId)).map(
    (connection) => ({
      kind: "stripe" as const,
      id: `stripe:${connection.organizationId}:${connection.stripeAccountId}`,
      clientName: "Stripe Projects",
      webChat: null,
      createdAt: Date.parse(connection.createdAt),
      organizationId: connection.organizationId,
      stripeAccountId: connection.stripeAccountId,
    }),
  );

  return sortBy(
    [...oauthConnections, ...stripeConnections],
    [(connection) => connection.createdAt, "desc"],
  );
}

export const revokeMcpConnectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("oauth"), grantId: z.string().min(1) }),
  z.object({
    kind: z.literal("stripe"),
    organizationId: z.string().min(1),
    stripeAccountId: z.string().min(1),
  }),
]);

// An OAuth client's next call gets 401 and it has to authorize again. Stripe
// gets 401 too, and the keys it handed out stop working.
async function revokeMcpConnection(
  userId: string,
  input: z.infer<typeof revokeMcpConnectionSchema>,
) {
  if (input.kind === "stripe") {
    await disconnectStripeConnection({
      userId,
      organizationId: input.organizationId,
      stripeAccountId: input.stripeAccountId,
    });
    return;
  }
  const { grantId } = input;
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
