import { createServerFn } from "@tanstack/react-start";
import {
  buildBacklinksDisabledAccessStatus,
  setBacklinksAccessStatus,
} from "@/server/features/backlinks/backlinksAccess";
import { assertBacklinksProjectAccess } from "@/server/features/backlinks/backlinksProjectAccess";
import { authenticatedServerFunctionMiddleware } from "@/serverFunctions/middleware";
import { BacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import { AppError } from "@/server/lib/errors";
import { backlinksOverviewInputSchema } from "@/types/schemas/backlinks";

export const getBacklinksOverview = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => backlinksOverviewInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertBacklinksProjectAccess(context.userId, data.projectId);

    try {
      return await BacklinksService.getOverview({
        target: data.target,
        scope: data.scope,
        includeSubdomains: data.includeSubdomains,
        includeIndirectLinks: data.includeIndirectLinks,
        excludeInternalBacklinks: data.excludeInternalBacklinks,
        status: data.status,
      });
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

export const getBacklinksReferringDomains = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => backlinksOverviewInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertBacklinksProjectAccess(context.userId, data.projectId);

    try {
      return await BacklinksService.getReferringDomains({
        target: data.target,
        scope: data.scope,
        includeSubdomains: data.includeSubdomains,
        includeIndirectLinks: data.includeIndirectLinks,
        excludeInternalBacklinks: data.excludeInternalBacklinks,
        status: data.status,
      });
    } catch (error) {
      await updateBacklinksAccessStatusOnError(error);
      throw error;
    }
  });

export const getBacklinksTopPages = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => backlinksOverviewInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertBacklinksProjectAccess(context.userId, data.projectId);

    try {
      return await BacklinksService.getTopPages({
        target: data.target,
        scope: data.scope,
        includeSubdomains: data.includeSubdomains,
        includeIndirectLinks: data.includeIndirectLinks,
        excludeInternalBacklinks: data.excludeInternalBacklinks,
        status: data.status,
      });
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
