import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { ToolExtra } from "@/server/mcp/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const authContext = {
  userId: "user_123",
  userEmail: "alice@example.com",
  organizationId: "org_123",
  clientId: "client_123",
  scopes: ["mcp"],
  audience: "https://open-seo.test/mcp",
  subject: "user_123",
  baseUrl: "https://open-seo.test",
};

const toolExtra: ToolExtra = {
  signal: new AbortController().signal,
  requestId: 1,
  sendNotification: vi.fn(),
  sendRequest: vi.fn(),
  authInfo: {
    token: "token",
    clientId: "client_123",
    scopes: ["mcp"],
    resource: new URL("https://open-seo.test/mcp"),
    extra: { [MCP_AUTH_CONTEXT_PROP]: authContext },
  } satisfies AuthInfo,
};

describe("withMcpProjectAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getProjectForOrganization.mockReset();
    // Default: the project belongs to the org. Individual tests override.
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_123",
      name: "Test",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("checks project access for the authenticated organization", async () => {
    const { withMcpProjectAuth } = await import("@/server/mcp/project-auth");
    const handler = vi.fn().mockResolvedValue("ok");

    const wrapped = withMcpProjectAuth(handler);
    await expect(
      wrapped({ projectId: "project_123" }, toolExtra),
    ).resolves.toBe("ok");

    expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
      "org_123",
      "project_123",
    );
  });

  it("passes auth, baseUrl, billing, and project context to the wrapped handler", async () => {
    const { withMcpProjectAuth } = await import("@/server/mcp/project-auth");
    const handler = vi.fn().mockReturnValue("ok");

    const wrapped = withMcpProjectAuth(handler);
    await wrapped({ projectId: "project_123" }, toolExtra);

    expect(handler).toHaveBeenCalledWith(
      { projectId: "project_123" },
      {
        auth: {
          userId: "user_123",
          userEmail: "alice@example.com",
          organizationId: "org_123",
          clientId: "client_123",
          scopes: ["mcp"],
          audience: "https://open-seo.test/mcp",
          subject: "user_123",
        },
        baseUrl: "https://open-seo.test",
        billing: {
          userId: "user_123",
          userEmail: "alice@example.com",
          organizationId: "org_123",
          projectId: "project_123",
        },
        project: {
          id: "project_123",
          name: "Test",
          locationCode: 2840,
          languageCode: "en",
        },
      },
    );
  });

  it("propagates project access failures without calling the wrapped handler", async () => {
    const error = new Error("project not found");
    mocks.getProjectForOrganization.mockRejectedValue(error);
    const { withMcpProjectAuth } = await import("@/server/mcp/project-auth");
    const handler = vi.fn();

    const wrapped = withMcpProjectAuth(handler);
    await expect(wrapped({ projectId: "project_123" }, toolExtra)).rejects.toBe(
      error,
    );

    expect(handler).not.toHaveBeenCalled();
  });

  // Defense-in-depth: even if the project lookup ever resolves falsy instead of
  // throwing (e.g. a future refactor returns null), the wrapper must still deny
  // access rather than run the handler with an unauthorized projectId.
  it("rejects when the project lookup resolves no project, without calling the handler", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);
    const { withMcpProjectAuth } = await import("@/server/mcp/project-auth");
    const handler = vi.fn();

    const wrapped = withMcpProjectAuth(handler);
    await expect(
      wrapped({ projectId: "someone-elses-project" }, toolExtra),
    ).rejects.toThrow();

    expect(handler).not.toHaveBeenCalled();
  });
});
