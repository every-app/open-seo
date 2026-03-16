import { createServerFn } from "@tanstack/react-start";
import { authenticatedServerFunctionMiddleware } from "@/serverFunctions/middleware";
import {
  buildBacklinksDisabledAccessStatus,
  buildVerifiedBacklinksAccessStatus,
  getBacklinksAccessStatus,
  setBacklinksAccessStatus,
} from "@/server/features/backlinks/backlinksAccess";
import { assertBacklinksProjectAccess } from "@/server/features/backlinks/backlinksProjectAccess";
import { AppError } from "@/server/lib/errors";
import { fetchBacklinksSummaryRaw } from "@/server/lib/dataforseoBacklinks";
import { backlinksProjectSchema } from "@/types/schemas/backlinks";

const BACKLINKS_ACCESS_CHECK_COOLDOWN_MS = 15 * 60 * 1000;

export const getBacklinksAccessSetupStatus = createServerFn({ method: "GET" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => backlinksProjectSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertBacklinksProjectAccess(context.userId, data.projectId);
    return getBacklinksAccessStatus();
  });

export const testBacklinksAccess = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => backlinksProjectSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertBacklinksProjectAccess(context.userId, data.projectId);

    const cachedStatus = await getBacklinksAccessStatus();
    if (isRecentVerifiedBacklinksAccessCheck(cachedStatus)) {
      return cachedStatus;
    }

    const checkedAt = new Date().toISOString();

    try {
      await fetchBacklinksSummaryRaw({
        target: "dataforseo.com",
        includeSubdomains: true,
        includeIndirectLinks: true,
        excludeInternalBacklinks: true,
        status: "live",
      });

      const status = buildVerifiedBacklinksAccessStatus(checkedAt);
      await setBacklinksAccessStatus(status);
      return status;
    } catch (error) {
      if (error instanceof AppError && error.code === "BACKLINKS_NOT_ENABLED") {
        const status = buildBacklinksDisabledAccessStatus(
          checkedAt,
          error.code,
        );
        await setBacklinksAccessStatus(status);
        return status;
      }

      throw error;
    }
  });

function isRecentVerifiedBacklinksAccessCheck(
  status: Awaited<ReturnType<typeof getBacklinksAccessStatus>>,
) {
  if (!status.enabled || !status.lastCheckedAt) {
    return false;
  }

  const lastChecked = Date.parse(status.lastCheckedAt);
  if (Number.isNaN(lastChecked)) {
    return false;
  }

  return Date.now() - lastChecked < BACKLINKS_ACCESS_CHECK_COOLDOWN_MS;
}
