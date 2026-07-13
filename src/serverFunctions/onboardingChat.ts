import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { AppError } from "@/server/lib/errors";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import {
  getLanguageCode,
  isSupportedLocationCode,
} from "@/shared/keyword-locations";

// Returns the onboarding project (id + domain). Uses the org's default project;
// onboarding targets a single project in v1.
export const getOnboardingChatState = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    const [project] = await ProjectService.listProjectsEnsuringOne(
      context.organizationId,
    );
    if (!project) {
      throw new AppError("NOT_FOUND");
    }
    return {
      projectId: project.id,
      domain: project.domain,
    };
  });

const saveSiteSchema = z.object({
  projectId: z.string().min(1),
  domain: z.string().min(1),
  locationCode: z.number().int(),
});

// Persists the site + default location for the onboarding project.
export const saveOnboardingSite = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(saveSiteSchema)
  .handler(async ({ data, context }) => {
    const project = await ProjectRepository.getProjectForOrganization(
      data.projectId,
      context.organizationId,
    );
    if (!project) {
      throw new AppError("NOT_FOUND");
    }

    if (!isSupportedLocationCode(data.locationCode)) {
      throw new AppError("VALIDATION_ERROR", "Unsupported location");
    }
    const newDomain = normalizeDomainInput(data.domain, false);
    await db
      .update(projects)
      .set({
        domain: newDomain,
        locationCode: data.locationCode,
        languageCode: getLanguageCode(data.locationCode),
      })
      .where(
        and(
          eq(projects.id, data.projectId),
          eq(projects.organizationId, context.organizationId),
        ),
      );

    return { ok: true };
  });
