import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  countProjects: vi.fn(),
  getProjectForOrganization: vi.fn(),
  listProjects: vi.fn(),
  tryCreateDefaultProject: vi.fn(),
}));

vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: mocks,
}));

const defaultProject = {
  id: "project_default",
  name: "Default",
  domain: null,
  createdAt: "2026-05-19 12:00:00",
};

const namedProject = {
  id: "project_acme",
  name: "Acme",
  domain: "acme.com",
  createdAt: "2026-05-20 12:00:00",
};

describe("project service", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  describe("listProjectsEnsuringOne", () => {
    it("returns existing projects without creating a Default", async () => {
      mocks.listProjects.mockResolvedValue([namedProject]);
      const { listProjectsEnsuringOne } = await import("./projects");

      await expect(listProjectsEnsuringOne("org_1")).resolves.toEqual([
        namedProject,
      ]);
      expect(mocks.tryCreateDefaultProject).not.toHaveBeenCalled();
      expect(mocks.listProjects).toHaveBeenCalledTimes(1);
    });

    it("creates a Default when the org has no projects", async () => {
      mocks.listProjects
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([defaultProject]);
      mocks.tryCreateDefaultProject.mockResolvedValue("project_default");
      const { listProjectsEnsuringOne } = await import("./projects");

      await expect(listProjectsEnsuringOne("org_1")).resolves.toEqual([
        defaultProject,
      ]);
      expect(mocks.tryCreateDefaultProject).toHaveBeenCalledWith("org_1");
      expect(mocks.listProjects).toHaveBeenCalledTimes(2);
    });

    it("recovers from the Default creation race", async () => {
      mocks.listProjects
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([defaultProject]);
      // A racing request won the insert, so this call's onConflictDoNothing
      // returns null — but the re-list still finds the Default.
      mocks.tryCreateDefaultProject.mockResolvedValue(null);
      const { listProjectsEnsuringOne } = await import("./projects");

      await expect(listProjectsEnsuringOne("org_1")).resolves.toEqual([
        defaultProject,
      ]);
    });
  });

  describe("createProject", () => {
    it("returns the full created project", async () => {
      mocks.createProject.mockResolvedValue(namedProject);
      const { createProject } = await import("./projects");

      await expect(
        createProject("org_1", { name: "Acme", domain: "acme.com" }),
      ).resolves.toEqual(namedProject);
      expect(mocks.createProject).toHaveBeenCalledWith(
        "org_1",
        "Acme",
        "acme.com",
      );
    });

    it("maps the reserved Default conflict to a friendly CONFLICT", async () => {
      mocks.createProject.mockRejectedValue(
        new Error(
          "UNIQUE constraint failed: projects.projects_one_default_per_organization_idx",
        ),
      );
      const { createProject } = await import("./projects");

      await expect(
        createProject("org_1", { name: "Default", domain: undefined }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("updateProject", () => {
    it("returns the updated project", async () => {
      mocks.updateProject.mockResolvedValue(namedProject);
      const { updateProject } = await import("./projects");

      await expect(
        updateProject("org_1", {
          projectId: "project_acme",
          name: "Acme",
          domain: "acme.com",
        }),
      ).resolves.toEqual(namedProject);
      expect(mocks.updateProject).toHaveBeenCalledWith(
        "project_acme",
        "org_1",
        { name: "Acme", domain: "acme.com" },
      );
    });

    it("clears the domain when none is provided", async () => {
      const cleared = { ...namedProject, domain: null };
      mocks.updateProject.mockResolvedValue(cleared);
      const { updateProject } = await import("./projects");

      await expect(
        updateProject("org_1", {
          projectId: "project_acme",
          name: "Acme",
          domain: undefined,
        }),
      ).resolves.toEqual(cleared);
      expect(mocks.updateProject).toHaveBeenCalledWith(
        "project_acme",
        "org_1",
        { name: "Acme", domain: undefined },
      );
    });
  });

  describe("deleteProject", () => {
    it("refuses to delete the org's only project", async () => {
      mocks.countProjects.mockResolvedValue(1);
      const { deleteProject } = await import("./projects");

      await expect(
        deleteProject("org_1", { projectId: "project_default" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mocks.deleteProject).not.toHaveBeenCalled();
    });

    it("deletes when more than one project remains", async () => {
      mocks.countProjects.mockResolvedValue(2);
      mocks.deleteProject.mockResolvedValue(undefined);
      const { deleteProject } = await import("./projects");

      await expect(
        deleteProject("org_1", { projectId: "project_acme" }),
      ).resolves.toEqual({ success: true });
      expect(mocks.deleteProject).toHaveBeenCalledWith("project_acme", "org_1");
    });
  });
});
