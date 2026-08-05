import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "cloudflare:workers";
import { BacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import { DashboardService } from "@/server/features/dashboard/services/DashboardService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  backlinksOverviewInputSchema,
  backlinksRowsPageRequestSchema,
  referringDomainsPageRequestSchema,
  topPagesPageRequestSchema,
} from "@/types/schemas/backlinks";

// The web UI exposes spam score as a regular user filter, so the implicit
// DataForSEO spam-score cutoff stays off for all web requests.
const WEB_SPAM_OPTIONS = { hideSpam: false };

export const getBacklinksOverview = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(backlinksOverviewInputSchema)
  .handler(async ({ data, context }) => {
    const profile = await BacklinksService.profileOverview(
      {
        target: data.target,
        scope: data.scope,
      },
      context,
    );
    // Keep the dashboard card coherent with what this page just showed.
    waitUntil(
      DashboardService.recordBacklinkSnapshotFromOverview({
        projectId: context.projectId,
        domain: context.project.domain,
        overview: profile.overview,
      }).catch((error: unknown) => {
        console.error("backlinks: snapshot sync from overview failed", error);
      }),
    );
    return profile.overview;
  });

export const getBacklinksRows = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(backlinksRowsPageRequestSchema)
  .handler(({ data, context }) =>
    BacklinksService.profileBacklinksPage(data, context, WEB_SPAM_OPTIONS),
  );

export const getBacklinksReferringDomains = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(referringDomainsPageRequestSchema)
  .handler(({ data, context }) =>
    BacklinksService.profileReferringDomainsPage(
      data,
      context,
      WEB_SPAM_OPTIONS,
    ),
  );

export const getBacklinksTopPages = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(topPagesPageRequestSchema)
  .handler(({ data, context }) =>
    BacklinksService.profileTopPagesPage(data, context),
  );
