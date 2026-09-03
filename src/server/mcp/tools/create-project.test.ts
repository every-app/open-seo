import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectTool } from "./create-project";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  listMembershipsForUser: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    createProject: mocks.createProject,
  },
}));

vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: {
    listMembershipsForUser: mocks.listMembershipsForUser,
  },
}));

const toolContext = makeToolContext();

describe("create_project MCP tool", () => {
  beforeEach(() => {});

  it("creates a project scoped to the caller's organization and returns it", async () => {
    mocks.createProject.mockResolvedValue({
      id: "project_new",
      name: "Acme",
      domain: "acme.com",
      locationCode: 2840,
      languageCode: "en",
    });

    const result = await createProjectTool.handler(
      { name: "Acme", domain: "acme.com", locationCode: 2840 },
      toolContext,
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

    await createProjectTool.handler({ name: "Just a name" }, toolContext);

    expect(mocks.createProject).toHaveBeenCalledWith("org_123", {
      name: "Just a name",
    });
  });

  it("rejects a languageCode without a locationCode (market pair rule)", async () => {
    await expect(
      createProjectTool.handler(
        { name: "Bad market", languageCode: "en" },
        toolContext,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("rejects an unsupported location as a readable validation error", async () => {
    const call = () =>
      createProjectTool.handler(
        { name: "Bad location", locationCode: 999999 },
        toolContext,
      );

    await expect(call()).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    // The message must name the offending field so the calling agent can
    // retry with a supported code, not just repeat the bare error code.
    await expect(call()).rejects.toThrow(
      "Unsupported DataForSEO location code",
    );
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("rejects a foreign organizationId on a organization-bound (pinned) connection", async () => {
    await expect(
      createProjectTool.handler(
        { name: "Acme", organizationId: "org_other" },
        toolContext,
      ),
    ).rejects.toThrow("bound to a single organization");
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("rejects a member role from creating projects", async () => {
    const memberContext = makeToolContext({ role: "member" });

    await expect(
      createProjectTool.handler({ name: "Acme" }, memberContext),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.createProject).not.toHaveBeenCalled();
  });
});

// User-scoped credentials (API keys): the target organization must be
// unambiguous — a single membership resolves implicitly, multiple require an
// explicit, membership-checked organizationId confirmed with the user.
describe("create_project with a user-scoped credential", () => {
  const userScopedContext = makeToolContext({ orgScope: "user" });
  const memberships = [
    { organizationId: "org_a", organizationName: "Alpha", role: "owner" },
    { organizationId: "org_b", organizationName: "Beta", role: "admin" },
  ];

  beforeEach(() => {
    mocks.createProject.mockResolvedValue({
      id: "project_new",
      name: "Acme",
      domain: null,
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.listMembershipsForUser.mockResolvedValue(memberships);
  });

  it("errors with the organization list when no organizationId is given and the user has several", async () => {
    await expect(
      createProjectTool.handler({ name: "Acme" }, userScopedContext),
    ).rejects.toThrow(/org_a {2}Alpha[\s\S]*org_b {2}Beta/);
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("creates in the named organization when the user is a member of it", async () => {
    await createProjectTool.handler(
      { name: "Acme", organizationId: "org_b" },
      userScopedContext,
    );

    expect(mocks.createProject).toHaveBeenCalledWith("org_b", {
      name: "Acme",
    });
  });

  it("rejects a organizationId the user is not a member of", async () => {
    await expect(
      createProjectTool.handler(
        { name: "Acme", organizationId: "org_stranger" },
        userScopedContext,
      ),
    ).rejects.toThrow("not a member");
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("resolves implicitly when the user belongs to exactly one organization", async () => {
    mocks.listMembershipsForUser.mockResolvedValue([memberships[0]]);

    await createProjectTool.handler({ name: "Acme" }, userScopedContext);

    expect(mocks.createProject).toHaveBeenCalledWith("org_a", {
      name: "Acme",
    });
  });
});
