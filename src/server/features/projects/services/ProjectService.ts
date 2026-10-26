import {
  archiveProject,
  createProject,
  getProjectForOrganization,
  listArchivedProjects,
  listProjects,
  listProjectsEnsuringOne,
  restoreProject,
  setProjectWebsite,
  updateProject,
} from "@/server/features/projects/services/projects";

export const ProjectService = {
  listProjects,
  listProjectsEnsuringOne,
  createProject,
  updateProject,
  setProjectWebsite,
  archiveProject,
  restoreProject,
  listArchivedProjects,
  getProjectForOrganization,
} as const;
