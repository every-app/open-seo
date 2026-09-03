import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeToolContext } from "@/server/mcp/tools/tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getProjectWithOrganization: vi.fn(),
  getMembership: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
    getProjectWithOrganization: mocks.getProjectWithOrganization,
  },
}));

vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: {
    getMembership: mocks.getMembership,
  },
}));

const toolContext = makeToolContext();

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
      wrapped({ projectId: "project_123" }, toolContext),
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
    await wrapped({ projectId: "project_123" }, toolContext);

    expect(handler).toHaveBeenCalledWith(
      { projectId: "project_123" },
      {
        auth: {
          userId: "user_123",
          userEmail: "alice@example.com",
          organizationId: "org_123",
          role: "owner",
          orgScope: "pinned",
          clientId: "client_123",
          scopes: ["mcp"],
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
    await expect(
      wrapped({ projectId: "project_123" }, toolContext),
    ).rejects.toBe(error);

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
      wrapped({ projectId: "someone-elses-project" }, toolContext),
    ).rejects.toThrow();

    expect(handler).not.toHaveBeenCalled();
  });
});

// User-scoped credentials (API keys): the org derives from the project and
// access is the caller's membership in that org — never the request's
// organizationId.
describe("withMcpProjectAuth with a user-scoped credential", () => {
  const userScopedContext = makeToolContext({ orgScope: "user" });

  beforeEach(() => {
    vi.resetModules();
    mocks.getProjectWithOrganization.mockResolvedValue({
      organizationId: "org_other",
      project: {
        id: "project_123",
        name: "Test",
        locationCode: 2840,
        languageCode: "en",
      },
    });
    mocks.getMembership.mockResolvedValue({ role: "admin" });
  });

  it("rebinds auth and billing to the project's org and the member's role there", async () => {
    const { withMcpProjectAuth } = await import("@/server/mcp/project-auth");
    const handler = vi.fn<
      (
        args: { projectId: string },
        context: {
          auth: { organizationId: string; role: string };
          billing: { organizationId: string };
        },
      ) => string
    >(() => "ok");

    await withMcpProjectAuth(handler)(
      { projectId: "project_123" },
      userScopedContext,
    );

    expect(mocks.getMembership).toHaveBeenCalledWith("user_123", "org_other");
    expect(mocks.getProjectForOrganization).not.toHaveBeenCalled();
    const [, context] = handler.mock.calls[0];
    expect(context.auth.organizationId).toBe("org_other");
    expect(context.auth.role).toBe("admin");
    expect(context.billing.organizationId).toBe("org_other");
  });

  it("rejects when the caller has no membership in the project's org", async () => {
    mocks.getMembership.mockResolvedValue(null);
    const { withMcpProjectAuth } = await import("@/server/mcp/project-auth");
    const handler = vi.fn();

    await expect(
      withMcpProjectAuth(handler)(
        { projectId: "project_123" },
        userScopedContext,
      ),
    ).rejects.toThrow("FORBIDDEN");

    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects an unknown project without leaking whether it exists", async () => {
    mocks.getProjectWithOrganization.mockResolvedValue(null);
    const { withMcpProjectAuth } = await import("@/server/mcp/project-auth");
    const handler = vi.fn();

    await expect(
      withMcpProjectAuth(handler)({ projectId: "missing" }, userScopedContext),
    ).rejects.toThrow("FORBIDDEN");

    expect(mocks.getMembership).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});
