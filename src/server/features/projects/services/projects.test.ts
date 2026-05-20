import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getDefaultProjectForOrganization: vi.fn(),
  getProjectById: vi.fn(),
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

describe("project service", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("recovers from the default project creation race", async () => {
    mocks.getDefaultProjectForOrganization
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(defaultProject);
    mocks.tryCreateDefaultProject.mockResolvedValue(null);
    const { getOrCreateDefaultProject } = await import("./projects");

    await expect(getOrCreateDefaultProject("org_1")).resolves.toEqual(
      defaultProject,
    );
    expect(mocks.tryCreateDefaultProject).toHaveBeenCalledWith("org_1");
    expect(mocks.getDefaultProjectForOrganization).toHaveBeenCalledTimes(2);
  });

  it("does not swallow unrelated default project create failures", async () => {
    const error = new Error("D1 unavailable");
    mocks.getDefaultProjectForOrganization.mockResolvedValue(null);
    mocks.tryCreateDefaultProject.mockRejectedValue(error);
    const { getOrCreateDefaultProject } = await import("./projects");

    await expect(getOrCreateDefaultProject("org_1")).rejects.toBe(error);
    expect(mocks.getDefaultProjectForOrganization).toHaveBeenCalledTimes(1);
  });
});
