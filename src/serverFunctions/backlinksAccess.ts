import { createServerFn } from "@tanstack/react-start";
import {
  buildBacklinksDisabledAccessStatus,
  buildVerifiedBacklinksAccessStatus,
  getBacklinksAccessStatus,
  setBacklinksAccessStatus,
} from "@/server/features/backlinks/backlinksAccess";
import { AppError } from "@/server/lib/errors";
import { createDataforseoClient } from "@/server/lib/dataforseoClient";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { backlinksProjectSchema } from "@/types/schemas/backlinks";

const BACKLINKS_ACCESS_CHECK_COOLDOWN_MS = 15 * 60 * 1000;

export const getBacklinksAccessSetupStatus = createServerFn({
  method: "GET",
})
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => backlinksProjectSchema.parse(data))
  .handler(async () => getBacklinksAccessStatus());

export const testBacklinksAccess = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => backlinksProjectSchema.parse(data))
  .handler(async ({ context }) => {
    if (await isHostedServerAuthMode()) {
      // Hosted deployments do not run the manual DataForSEO access test here;
      // backlinks access is treated as platform-managed in this mode.
      return getBacklinksAccessStatus();
    }

    const cachedStatus = await getBacklinksAccessStatus();
    if (isRecentVerifiedBacklinksAccessCheck(cachedStatus)) {
      return cachedStatus;
    }

    const checkedAt = new Date().toISOString();
    const dataforseo = createDataforseoClient(context);

    try {
      await dataforseo.backlinks.summary({
        target: "dataforseo.com",
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
