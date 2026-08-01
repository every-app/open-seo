import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { ToolExtra } from "@/server/mcp/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    createProject: mocks.createProject,
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

describe("create_project MCP tool", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createProject.mockReset();
  });

  it("creates a project scoped to the caller's organization and returns it", async () => {
    mocks.createProject.mockResolvedValue({
      id: "project_new",
      name: "Acme",
      domain: "acme.com",
      locationCode: 2840,
      languageCode: "en",
    });
    const { createProjectTool } = await import("./create-project");

    const result = await createProjectTool.handler(
      { name: "Acme", domain: "acme.com", locationCode: 2840 },
      toolExtra,
    );

    // The schema does not derive languageCode; the service resolves it from
    // the locationCode, so the tool forwards exactly what was validated.
    expect(mocks.createProject).toHaveBeenCalledWith("org_123", {
      name: "Acme",
      domain: "acme.com",
      locationCode: 2840,
    });
    expect(result.structuredContent?.project).toMatchObject({
      id: "project_new",
      name: "Acme",
      domain: "acme.com",
      locationCode: 2840,
      languageCode: "en",
      url: "https://open-seo.test/p/project_new",
    });
    const first = result.content?.[0];
    expect(first?.type).toBe("text");
    if (first?.type === "text") {
      expect(first.text).toContain("project_new");
    }
  });

  it("creates a minimal project with only a name (org default market)", async () => {
    mocks.createProject.mockResolvedValue({
      id: "project_min",
      name: "Just a name",
      domain: null,
      locationCode: 2840,
      languageCode: "en",
    });
    const { createProjectTool } = await import("./create-project");

    await createProjectTool.handler({ name: "Just a name" }, toolExtra);

    expect(mocks.createProject).toHaveBeenCalledWith("org_123", {
      name: "Just a name",
    });
  });

  it("rejects a languageCode without a locationCode (market pair rule)", async () => {
    const { createProjectTool } = await import("./create-project");

    await expect(
      createProjectTool.handler(
        { name: "Bad market", languageCode: "en" },
        toolExtra,
      ),
    ).rejects.toThrow();
    expect(mocks.createProject).not.toHaveBeenCalled();
  });
});
