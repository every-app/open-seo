import {
  createProject,
  deleteProject,
  getProjectForOrganization,
  listProjects,
  listProjectsEnsuringOne,
  updateProject,
} from "@/server/features/projects/services/projects";

export const ProjectService = {
  listProjects,
  listProjectsEnsuringOne,
  createProject,
  updateProject,
  deleteProject,
  getProjectForOrganization,
} as const;
