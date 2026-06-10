import { createServerFn } from "@tanstack/react-start";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";
import {
  archiveProjectSchema,
  createProjectSchema,
  restoreProjectSchema,
  updateProjectSchema,
} from "@/types/schemas/projects";
import { z } from "zod";

export const getProjects = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    ProjectService.listProjectsEnsuringOne(context.organizationId),
  );

export const createProject = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .inputValidator((data: unknown) => createProjectSchema.parse(data))
  .handler(async ({ data, context }) =>
    ProjectService.createProject(context.organizationId, data),
  );

export const updateProject = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => updateProjectSchema.parse(data))
  .handler(async ({ data, context }) =>
    ProjectService.updateProject(context.organizationId, data),
  );

export const archiveProject = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => archiveProjectSchema.parse(data))
  .handler(async ({ data, context }) =>
    ProjectService.archiveProject(context.organizationId, data),
  );

export const getArchivedProjects = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    ProjectService.listArchivedProjects(context.organizationId),
  );

export const restoreProject = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .inputValidator((data: unknown) => restoreProjectSchema.parse(data))
  .handler(async ({ data, context }) =>
    ProjectService.restoreProject(context.organizationId, data),
  );

export const getProjectAccess = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .inputValidator((data: unknown) =>
    z.object({ projectId: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    return ProjectService.getProjectForOrganization(
      context.organizationId,
      data.projectId,
    );
  });
