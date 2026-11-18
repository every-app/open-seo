import { beforeEach, describe, expect, it, vi } from "vitest";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { makeToolContext } from "@/server/mcp/tools/tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const toolContext = makeToolContext();

describe("withMcpProjectAuth", () => {
  beforeEach(() => {
    // Default: the project belongs to the org. Individual tests override.
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_123",
      name: "Test",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("checks project access for the credential's organization and passes auth, billing, and project context to the handler", async () => {
    const handler = vi.fn().mockReturnValue("ok");

    const wrapped = withMcpProjectAuth(handler);
    await wrapped({ projectId: "project_123" }, toolContext);

    expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
      "org_123",
      "project_123",
    );
    expect(handler).toHaveBeenCalledWith(
      { projectId: "project_123" },
      {
        auth: {
          userId: "user_123",
          userEmail: "alice@example.com",
          organizationId: "org_123",
          role: "owner",
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

  // Defense-in-depth: even if the project lookup ever resolves falsy instead of
  // throwing (e.g. a future refactor returns null), the wrapper must still deny
  // access rather than run the handler with an unauthorized projectId.
  it("rejects when the project lookup resolves no project, without calling the handler", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);
    const handler = vi.fn();

    const wrapped = withMcpProjectAuth(handler);
    await expect(
      wrapped({ projectId: "someone-elses-project" }, toolContext),
    ).rejects.toThrow();

    expect(handler).not.toHaveBeenCalled();
  });
});
