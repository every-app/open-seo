import { waitUntil } from "cloudflare:workers";
import { DashboardFirstAuditService } from "@/server/features/dashboard/services/DashboardFirstAuditService";
import { createServerFn } from "@tanstack/react-start";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";
import {
  archiveProjectSchema,
  createProjectSchema,
  restoreProjectSchema,
  setProjectWebsiteSchema,
  updateProjectSchema,
} from "@/types/schemas/projects";
import { z } from "zod";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

export const getProjects = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    ProjectService.listProjectsEnsuringOne(context.organizationId),
  );

export const createProject = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createProjectSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { project: ["create"] });
    const project = await ProjectService.createProject(
      context.organizationId,
      data,
    );
    const initialAudit = await DashboardFirstAuditService.start(
      project.id,
      project.domain,
      { ...context, projectId: project.id },
    );
    return { ...project, initialAudit };
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateProjectSchema)
  .handler(async ({ data, context }) => {
    const project = await ProjectService.updateProject(
      context.organizationId,
      data,
    );
    const initialAudit =
      project.domain !== context.project.domain
        ? await DashboardFirstAuditService.start(
            project.id,
            project.domain,
            context,
          )
        : null;
    return { ...project, initialAudit };
  });

// Onboarding's website step. Starting the first audit checks DNS and probes
// the site, which takes seconds on a slow host, so it runs after the response
// and the wizard moves on at once. start() skips projects that already have an
// audit and logs its own failures.
export const saveOnboardingWebsite = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setProjectWebsiteSchema)
  .handler(async ({ data, context }) => {
    const project = await ProjectService.updateProject(context.organizationId, {
      ...data,
      // Name the auto-created project after the site it now tracks.
      name:
        context.project.name === "Default" ? data.domain : context.project.name,
    });
    waitUntil(
      DashboardFirstAuditService.start(project.id, project.domain, context),
    );
    return project;
  });

export const archiveProject = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(archiveProjectSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { project: ["delete"] });
    return ProjectService.archiveProject(context.organizationId, data);
  });

export const getArchivedProjects = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    ProjectService.listArchivedProjects(context.organizationId),
  );

export const restoreProject = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(restoreProjectSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { project: ["delete"] });
    return ProjectService.restoreProject(context.organizationId, data);
  });

export const getProjectAccess = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(projectScopedSchema)
  .handler(async ({ data, context }) => {
    return ProjectService.getProjectForOrganization(
      context.organizationId,
      data.projectId,
    );
  });
