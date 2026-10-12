import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveProject,
  createProject,
  listProjectsEnsuringOne,
  restoreProject,
  setProjectWebsite,
  updateProject,
} from "./projects";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  updateProjectWebsite: vi.fn(),
  archiveProject: vi.fn(),
  restoreProject: vi.fn(),
  countProjects: vi.fn(),
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
    // The create "Default conflict" test sets a persistent rejection.
    mocks.createProject.mockResolvedValue(namedProject);
  });

  describe("listProjectsEnsuringOne", () => {
    it("returns existing projects without creating a Default", async () => {
      mocks.listProjects.mockResolvedValue([namedProject]);

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

      await expect(listProjectsEnsuringOne("org_1")).resolves.toEqual([
        defaultProject,
      ]);
      expect(mocks.tryCreateDefaultProject).toHaveBeenCalledWith("org_1");
      expect(mocks.listProjects).toHaveBeenCalledTimes(2);
    });
  });

  describe("setProjectWebsite", () => {
    it("saves normalized domain and market in one write without changing the name", async () => {
      mocks.updateProjectWebsite.mockResolvedValue(namedProject);
      await setProjectWebsite("org_1", {
        projectId: "project_acme",
        domain: "https://www.acme.com/about",
        locationCode: 2826,
        languageCode: "en",
      });
      expect(mocks.updateProjectWebsite).toHaveBeenCalledWith(
        "project_acme",
        "org_1",
        "acme.com",
        { locationCode: 2826, languageCode: "en" },
      );
      expect(mocks.updateProject).not.toHaveBeenCalled();
    });
  });

  describe("createProject", () => {
    it("derives the native language when only the location is given", async () => {
      mocks.createProject.mockResolvedValue(namedProject);

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
      mocks.createProject.mockRejectedValue(uniqueViolation());

      await expect(
        createProject("org_1", { name: "Default", domain: undefined }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("updateProject", () => {
    it("rejects a junk domain instead of storing it", async () => {
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

  describe("archiveProject", () => {
    it("refuses to archive the org's only project and allows it with two", async () => {
      mocks.countProjects.mockResolvedValue(1);
      await expect(
        archiveProject("org_1", { projectId: "project_default" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mocks.archiveProject).not.toHaveBeenCalled();

      mocks.countProjects.mockResolvedValue(2);
      mocks.archiveProject.mockResolvedValue(undefined);
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
    it("maps the Default singleton conflict to a friendly CONFLICT", async () => {
      mocks.restoreProject.mockRejectedValue(uniqueViolation());

      await expect(
        restoreProject("org_1", { archivedProjectId: "project_default" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });
});

// Drizzle wraps the driver's error, so the UNIQUE text is only on the cause.
function uniqueViolation() {
  return new Error("Failed query: insert into projects", {
    cause: new Error(
      "UNIQUE constraint failed: projects.organization_id: SQLITE_CONSTRAINT",
    ),
  });
}
