import { createServerFn } from "@tanstack/react-start";
import {
  buildBacklinksDisabledAccessStatus,
  setBacklinksAccessStatus,
} from "@/server/features/backlinks/backlinksAccess";
import { BacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import { AppError } from "@/server/lib/errors";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { backlinksOverviewInputSchema } from "@/types/schemas/backlinks";

export const getBacklinksOverview = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => backlinksOverviewInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    try {
      const input = {
        target: data.target,
        scope: data.scope,
        includeSubdomains: data.includeSubdomains,
        includeIndirectLinks: data.includeIndirectLinks,
        excludeInternalBacklinks: data.excludeInternalBacklinks,
        status: data.status,
      };
      const profile = await BacklinksService.profileOverview(input, {
        organizationId: context.organizationId,
        userEmail: context.userEmail,
      });
      return profile.overview;
    } catch (error) {
      if (error instanceof AppError && error.code === "BACKLINKS_NOT_ENABLED") {
        const checkedAt = new Date().toISOString();
        await setBacklinksAccessStatus(
          buildBacklinksDisabledAccessStatus(checkedAt, error.code),
        );
      }

      throw error;
    }
  });

export const getBacklinksReferringDomains = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => backlinksOverviewInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    try {
      const input = {
        target: data.target,
        scope: data.scope,
        includeSubdomains: data.includeSubdomains,
        includeIndirectLinks: data.includeIndirectLinks,
        excludeInternalBacklinks: data.excludeInternalBacklinks,
        status: data.status,
      };
      const profile = await BacklinksService.profileReferringDomains(input, {
        organizationId: context.organizationId,
        userEmail: context.userEmail,
      });
      return profile.rows;
    } catch (error) {
      await updateBacklinksAccessStatusOnError(error);
      throw error;
    }
  });

export const getBacklinksTopPages = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => backlinksOverviewInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    try {
      const input = {
        target: data.target,
        scope: data.scope,
        includeSubdomains: data.includeSubdomains,
        includeIndirectLinks: data.includeIndirectLinks,
        excludeInternalBacklinks: data.excludeInternalBacklinks,
        status: data.status,
      };
      const profile = await BacklinksService.profileTopPages(input, {
        organizationId: context.organizationId,
        userEmail: context.userEmail,
      });
      return profile.rows;
    } catch (error) {
      await updateBacklinksAccessStatusOnError(error);
      throw error;
    }
  });

async function updateBacklinksAccessStatusOnError(error: unknown) {
  if (error instanceof AppError && error.code === "BACKLINKS_NOT_ENABLED") {
    const checkedAt = new Date().toISOString();
    await setBacklinksAccessStatus(
      buildBacklinksDisabledAccessStatus(checkedAt, error.code),
    );
  }
}
