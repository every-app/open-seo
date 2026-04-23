import { createServerFn } from "@tanstack/react-start";
import { BacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { backlinksOverviewInputSchema } from "@/types/schemas/backlinks";

export const getBacklinksOverview = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => backlinksOverviewInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const input = {
      target: data.target,
      scope: data.scope,
    };
    const spamOptions = {
      hideSpam: data.hideSpam,
      spamThreshold: data.spamThreshold,
    };
    const profile = await BacklinksService.profileOverview(
      input,
      context,
      spamOptions,
    );
    return profile.overview;
  });

export const getBacklinksReferringDomains = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => backlinksOverviewInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const input = {
      target: data.target,
      scope: data.scope,
    };
    const profile = await BacklinksService.profileReferringDomains(
      input,
      context,
    );
    return profile.rows;
  });

export const getBacklinksTopPages = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => backlinksOverviewInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const input = {
      target: data.target,
      scope: data.scope,
    };
    const profile = await BacklinksService.profileTopPages(input, context);
    return profile.rows;
  });
