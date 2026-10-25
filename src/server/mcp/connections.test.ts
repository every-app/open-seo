import { expect, it, vi } from "vitest";
import { McpConnectionsService } from "./connections";

const helpers = vi.hoisted(() => ({
  listUserGrants: vi.fn(),
  lookupClient: vi.fn(),
  revokeGrant: vi.fn(),
}));

vi.mock("@/server/mcp/oauth-provider", () => ({
  getCapturedOAuthHelpers: () => helpers,
}));

it("lists grants newest first with the client name and bound organization", async () => {
  helpers.listUserGrants.mockResolvedValue({
    items: [
      {
        id: "grant-old",
        clientId: "codex",
        metadata: { organizationId: "org-1" },
        createdAt: 1_700_000_000,
      },
      {
        id: "grant-new",
        clientId: "deleted-client",
        metadata: null,
        createdAt: 1_700_000_100,
      },
    ],
  });
  helpers.lookupClient.mockImplementation((clientId: string) =>
    Promise.resolve(clientId === "codex" ? { clientName: "Codex" } : null),
  );

  await expect(
    McpConnectionsService.listMcpConnections("user-1"),
  ).resolves.toEqual([
    {
      id: "grant-new",
      clientName: "MCP client",
      createdAt: 1_700_000_100_000,
      organizationId: null,
    },
    {
      id: "grant-old",
      clientName: "Codex",
      createdAt: 1_700_000_000_000,
      organizationId: "org-1",
    },
  ]);
});
