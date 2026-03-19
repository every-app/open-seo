import {
  createProject,
  deleteProject,
  getOrCreateDefaultProject,
  getProject,
  getProjectForOrganization,
  listProjects,
} from "@/server/features/projects/services/projects";

export const ProjectService = {
  listProjects,
  createProject,
  deleteProject,
  getOrCreateDefaultProject,
  getProject,
  getProjectForOrganization,
} as const;
