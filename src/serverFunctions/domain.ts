import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  domainOverviewSchema,
  domainKeywordSuggestionsSchema,
} from "@/types/schemas/domain";
import { DomainService } from "@/server/features/domain/services/DomainService";

export const getDomainOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => domainOverviewSchema.parse(data))
  .handler(async ({ data, context }) =>
    DomainService.getOverview(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    ),
  );

export const getDomainKeywordSuggestions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => domainKeywordSuggestionsSchema.parse(data))
  .handler(async ({ data, context }) =>
    DomainService.getSuggestedKeywords(
      {
        ...data,
        organizationId: context.organizationId,
        projectId: context.projectId,
      },
      context,
    ),
  );
