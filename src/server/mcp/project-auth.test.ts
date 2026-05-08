import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getMcpAuthContext: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("agents/mcp", () => ({
  getMcpAuthContext: mocks.getMcpAuthContext,
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

describe("withMcpProjectAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getMcpAuthContext.mockReset();
    mocks.getProjectForOrganization.mockReset();
    mocks.getMcpAuthContext.mockReturnValue({
      props: { [MCP_AUTH_CONTEXT_PROP]: authContext },
    });
  });

  it("checks project access for the authenticated organization", async () => {
    const { withMcpProjectAuth } = await import("@/server/mcp/project-auth");
    const handler = vi.fn().mockResolvedValue("ok");

    const wrapped = withMcpProjectAuth(handler);
    await expect(
      wrapped({ projectId: "project_123" }, undefined),
    ).resolves.toBe("ok");

    expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
      "org_123",
      "project_123",
    );
  });

  it("passes auth, baseUrl, and billing context to the wrapped handler", async () => {
    const { withMcpProjectAuth } = await import("@/server/mcp/project-auth");
    const handler = vi.fn().mockReturnValue("ok");

    const wrapped = withMcpProjectAuth(handler);
    await wrapped({ projectId: "project_123" }, undefined);

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
      },
    );
  });

  it("propagates project access failures without calling the wrapped handler", async () => {
    const error = new Error("project not found");
    mocks.getProjectForOrganization.mockRejectedValue(error);
    const { withMcpProjectAuth } = await import("@/server/mcp/project-auth");
    const handler = vi.fn();

    const wrapped = withMcpProjectAuth(handler);
    await expect(wrapped({ projectId: "project_123" }, undefined)).rejects.toBe(
      error,
    );

    expect(handler).not.toHaveBeenCalled();
  });
});
