import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  PagespeedService,
  PagespeedNotConfiguredError,
} from "@/server/features/pagespeed/services/PagespeedService";
import { AppError } from "@/server/lib/errors";
import { isExpectedPagespeedFailure } from "@/server/lib/pagespeedClient";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const urlScopedSchema = projectScopedSchema.extend({
  urlId: z.string().min(1),
});
const addUrlSchema = projectScopedSchema.extend({
  url: z.string().min(1).max(2048),
});
const setScheduleSchema = projectScopedSchema.extend({
  urlId: z.string().min(1),
  enabled: z.boolean(),
});
const snapshotScopedSchema = projectScopedSchema.extend({
  snapshotId: z.string().min(1),
});

/**
 * Monitored URLs plus recent snapshots. A missing PAGESPEED_API_KEY resolves
 * to { configured: false } so the page renders the setup card instead of an
 * error boundary — the Vercel pattern.
 */
export const getPagespeedOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    try {
      const overview = await PagespeedService.getOverview({
        projectId: context.projectId,
        organizationId: context.organizationId,
        userId: context.userId,
        domain: context.project.domain,
      });
      return { configured: true as const, ...overview };
    } catch (error) {
      if (error instanceof PagespeedNotConfiguredError) {
        return { configured: false as const };
      }
      throw error;
    }
  });

export const addPagespeedUrl = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(addUrlSchema)
  .handler(async ({ data, context }) => {
    const url = await PagespeedService.addUrl({
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      url: data.url,
    });
    return { url };
  });

export const removePagespeedUrl = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(urlScopedSchema)
  .handler(async ({ data, context }) => {
    await PagespeedService.removeUrl({
      projectId: context.projectId,
      urlId: data.urlId,
    });
    return { removed: true as const };
  });

/** Pause or resume the daily sweep for one URL. */
export const setPagespeedUrlSchedule = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setScheduleSchema)
  .handler(async ({ data, context }) => {
    await PagespeedService.setUrlSchedule({
      projectId: context.projectId,
      urlId: data.urlId,
      enabled: data.enabled,
    });
    return { enabled: data.enabled };
  });

/**
 * Run mobile + desktop for one URL. Takes 10-30s: the two strategies run
 * concurrently, so the wait is the slower of the two, not their sum. "Run
 * all" is a client-side fan-out over this, so one URL failing cannot abort
 * the rest.
 */
export const runPagespeedForUrl = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(urlScopedSchema)
  .handler(async ({ data, context }) => {
    try {
      const snapshots = await PagespeedService.runForUrl({
        projectId: context.projectId,
        urlId: data.urlId,
      });
      return { snapshots };
    } catch (error) {
      if (error instanceof PagespeedNotConfiguredError) {
        throw new AppError(
          "VALIDATION_ERROR",
          "PageSpeed Insights is not configured on this instance.",
        );
      }
      // A whole-run failure (rather than a per-strategy one) means the key or
      // quota is bad; surface the client's copy rather than a generic fault.
      if (isExpectedPagespeedFailure(error) && error instanceof Error) {
        throw new AppError("UPSTREAM_UNAVAILABLE", error.message);
      }
      throw error;
    }
  });

/**
 * The stored Lighthouse issues behind one run — which opportunities to fix,
 * not just the score. Resolves to `{ available: false }` for runs stored before
 * payloads were kept, or whose upload failed, so the panel can say "re-run to
 * see details" instead of erroring.
 */
export const getPagespeedIssues = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(snapshotScopedSchema)
  .handler(async ({ data, context }) => {
    const payload = await PagespeedService.getSnapshotIssues({
      projectId: context.projectId,
      snapshotId: data.snapshotId,
    });
    if (!payload) return { available: false as const };
    return { available: true as const, payload };
  });
