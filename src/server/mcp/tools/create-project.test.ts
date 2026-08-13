import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectTool } from "./create-project";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    createProject: mocks.createProject,
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
    ).rejects.toThrow();
    expect(mocks.createProject).not.toHaveBeenCalled();
  });
});
