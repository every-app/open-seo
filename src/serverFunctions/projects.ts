import { createServerFn } from "@tanstack/react-start";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";
import { z } from "zod";

export const getOrCreateDefaultProject = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    ProjectService.getOrCreateDefaultProject(context.organizationId),
  );

export const getProjectAccess = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) =>
    z.object({ projectId: z.string().min(1) }).parse(data),
  )
  .handler(async ({ context }) => {
    return ProjectService.getProjectForOrganization(
      context.organizationId,
      context.project.id,
    );
  });
