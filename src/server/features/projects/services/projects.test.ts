import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  updateProjectDomain: vi.fn(),
  archiveProject: vi.fn(),
  restoreProject: vi.fn(),
  countProjects: vi.fn(),
  updateProjectMarket: vi.fn(),
  getProjectForOrganization: vi.fn(),
  listProjects: vi.fn(),
  listArchivedProjects: vi.fn(),
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
        undefined,
      );
    });

    it("derives the native language when only the location is given", async () => {
      mocks.createProject.mockResolvedValue(namedProject);
      const { createProject } = await import("./projects");

      await createProject("org_1", {
        name: "Acme",
        domain: "acme.com",
        locationCode: 2704,
      });
      expect(mocks.createProject).toHaveBeenCalledWith(
        "org_1",
        "Acme",
        "acme.com",
        { locationCode: 2704, languageCode: "vi" },
      );
    });

    it("rejects a language DataForSEO does not serve for the location", async () => {
      const { createProject } = await import("./projects");

      await expect(
        createProject("org_1", {
          name: "Acme",
          locationCode: 2840,
          languageCode: "vi",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(mocks.createProject).not.toHaveBeenCalled();
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
    it("leaves the market columns untouched when neither half is given", async () => {
      mocks.updateProject.mockResolvedValue(namedProject);
      const { updateProject } = await import("./projects");

      await updateProject("org_1", { projectId: "project_acme", name: "Acme" });
      expect(mocks.updateProject).toHaveBeenCalledWith(
        "project_acme",
        "org_1",
        expect.objectContaining({ market: undefined }),
      );
    });

    it("snaps the language on a location-only change without reading the stored row", async () => {
      mocks.updateProject.mockResolvedValue(namedProject);
      const { updateProject } = await import("./projects");

      await updateProject("org_1", {
        projectId: "project_acme",
        name: "Acme",
        locationCode: 2276,
      });
      expect(mocks.getProjectForOrganization).not.toHaveBeenCalled();
      expect(mocks.updateProject).toHaveBeenCalledWith(
        "project_acme",
        "org_1",
        expect.objectContaining({
          market: { locationCode: 2276, languageCode: "de" },
        }),
      );
    });

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

  describe("setProjectDomain", () => {
    it("canonicalizes a pasted URL to the bare host before writing", async () => {
      mocks.updateProjectDomain.mockResolvedValue(namedProject);
      const { setProjectDomain } = await import("./projects");

      await setProjectDomain("org_1", {
        projectId: "project_acme",
        domain: "https://www.Acme.com/pricing?ref=x",
      });

      expect(mocks.updateProjectDomain).toHaveBeenCalledWith(
        "project_acme",
        "org_1",
        "acme.com",
      );
    });

    it("rejects junk that the backlink fetch would later refuse", async () => {
      const { setProjectDomain } = await import("./projects");

      await expect(
        setProjectDomain("org_1", {
          projectId: "project_acme",
          domain: "not a domain",
        }),
      ).rejects.toThrow("Enter a valid domain");
      expect(mocks.updateProjectDomain).not.toHaveBeenCalled();
    });
  });

  describe("updateProject domain validation", () => {
    it("rejects a junk domain instead of storing it", async () => {
      const { updateProject } = await import("./projects");

      await expect(
        updateProject("org_1", {
          projectId: "project_acme",
          name: "Acme",
          domain: "999.999.999.999",
        }),
      ).rejects.toThrow("Enter a valid domain");
      expect(mocks.updateProject).not.toHaveBeenCalled();
    });
  });

  describe("setProjectMarket", () => {
    it("writes only the market columns, leaving name and domain untouched", async () => {
      // Onboarding sets the market before the project is named or given a
      // domain; going through updateProject would clear the domain.
      mocks.updateProjectMarket.mockResolvedValue({
        ...namedProject,
        locationCode: 2704,
        languageCode: "vi",
      });
      const { setProjectMarket } = await import("./projects");

      await setProjectMarket("org_1", {
        projectId: "project_acme",
        locationCode: 2704,
        languageCode: "vi",
      });

      expect(mocks.updateProjectMarket).toHaveBeenCalledWith(
        "project_acme",
        "org_1",
        { locationCode: 2704, languageCode: "vi" },
      );
      expect(mocks.updateProject).not.toHaveBeenCalled();
    });

    it("rejects a language the location does not serve before any write", async () => {
      const { setProjectMarket } = await import("./projects");

      await expect(
        setProjectMarket("org_1", {
          projectId: "project_acme",
          locationCode: 2840,
          languageCode: "vi",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(mocks.updateProjectMarket).not.toHaveBeenCalled();
    });
  });

  describe("archiveProject", () => {
    it("refuses to archive the org's only project", async () => {
      mocks.countProjects.mockResolvedValue(1);
      const { archiveProject } = await import("./projects");

      await expect(
        archiveProject("org_1", { projectId: "project_default" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mocks.archiveProject).not.toHaveBeenCalled();
    });

    it("archives when more than one project remains", async () => {
      mocks.countProjects.mockResolvedValue(2);
      mocks.archiveProject.mockResolvedValue(undefined);
      const { archiveProject } = await import("./projects");

      await expect(
        archiveProject("org_1", { projectId: "project_acme" }),
      ).resolves.toEqual({ success: true });
      expect(mocks.archiveProject).toHaveBeenCalledWith(
        "project_acme",
        "org_1",
      );
    });
  });

  describe("restoreProject", () => {
    it("restores an archived project", async () => {
      mocks.restoreProject.mockResolvedValue(undefined);
      const { restoreProject } = await import("./projects");

      await expect(
        restoreProject("org_1", { archivedProjectId: "project_acme" }),
      ).resolves.toEqual({ success: true });
      expect(mocks.restoreProject).toHaveBeenCalledWith(
        "project_acme",
        "org_1",
      );
    });

    it("maps the Default singleton conflict to a friendly CONFLICT", async () => {
      mocks.restoreProject.mockRejectedValue(
        new Error(
          "UNIQUE constraint failed: projects.projects_one_default_per_organization_idx",
        ),
      );
      const { restoreProject } = await import("./projects");

      await expect(
        restoreProject("org_1", { archivedProjectId: "project_default" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });
});
