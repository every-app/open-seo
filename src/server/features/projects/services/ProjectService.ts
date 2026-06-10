import {
  archiveProject,
  createProject,
  getProjectForOrganization,
  listArchivedProjects,
  listProjects,
  listProjectsEnsuringOne,
  restoreProject,
  updateProject,
} from "@/server/features/projects/services/projects";

export const ProjectService = {
  listProjects,
  listProjectsEnsuringOne,
  createProject,
  updateProject,
  archiveProject,
  restoreProject,
  listArchivedProjects,
  getProjectForOrganization,
} as const;
