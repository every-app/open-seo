import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ProjectWebsiteService } from "@/server/features/projects/services/ProjectWebsiteService";
import { captureMetaSetupStep, MetaSetupEvent } from "@/server/referrals/meta";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  researchProjectWebsiteSchema,
  saveProjectWebsiteSetupSchema,
} from "@/types/schemas/projectWebsite";

export const researchProjectWebsite = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(researchProjectWebsiteSchema)
  .handler(({ data, context }) =>
    ProjectWebsiteService.research(context.projectId, data.website, context),
  );
export const saveProjectWebsiteSetup = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(saveProjectWebsiteSetupSchema)
  .handler(async ({ data, context }) => {
    const { project } = await ProjectWebsiteService.save(
      { ...data, projectId: context.projectId },
      context,
      "user",
      { runSeededTracking: true },
    );
    if (!context.project.domain) {
      await captureMetaSetupStep(
        MetaSetupEvent.WebsiteAdded,
        context.organizationId,
        getRequest(),
      );
    }
    return project;
  });
