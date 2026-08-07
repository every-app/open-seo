import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  domainOverviewSchema,
  domainKeywordSuggestionsSchema,
  domainKeywordsPageRequestSchema,
  domainPagesPageRequestSchema,
} from "@/types/schemas/domain";
import { DomainService } from "@/server/features/domain/services/DomainService";
import { resolveLabsMarket } from "@/shared/keyword-locations";

function shouldUseDomainE2eFixtures() {
  return import.meta.env.VITE_E2E_DOMAIN_FIXTURES === "1";
}

async function getDomainE2eFixtures() {
  return import("../../e2e/fixtures/domain-overview-fixtures");
}

export const getDomainOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(domainOverviewSchema)
  .handler(async ({ data, context }) => {
    const input = {
      ...data,
      ...resolveLabsMarket(data, context.project),
      projectId: context.projectId,
    };
    if (shouldUseDomainE2eFixtures()) {
      const fixtures = await getDomainE2eFixtures();
      return fixtures.getFixtureOverview(input.domain);
    }

    return DomainService.getOverview(input, context);
  });

export const getDomainKeywordSuggestions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(domainKeywordSuggestionsSchema)
  .handler(async ({ data, context }) =>
    DomainService.getSuggestedKeywords(
      {
        ...data,
        ...resolveLabsMarket(data, context.project),
        organizationId: context.organizationId,
        projectId: context.projectId,
      },
      context,
    ),
  );

export const getDomainKeywordsPage = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(domainKeywordsPageRequestSchema)
  .handler(async ({ data, context }) => {
    const input = {
      ...data,
      ...resolveLabsMarket(data, context.project),
      projectId: context.projectId,
    };
    if (shouldUseDomainE2eFixtures()) {
      const fixtures = await getDomainE2eFixtures();
      return fixtures.getFixtureKeywordsPage(input);
    }

    return DomainService.getKeywordsPage(input, context);
  });

export const getDomainPagesPage = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(domainPagesPageRequestSchema)
  .handler(async ({ data, context }) => {
    const input = {
      ...data,
      ...resolveLabsMarket(data, context.project),
      projectId: context.projectId,
    };
    if (shouldUseDomainE2eFixtures()) {
      const fixtures = await getDomainE2eFixtures();
      return fixtures.getFixturePagesPage(input);
    }

    return DomainService.getPagesPage(input, context);
  });

// Refresh: deletes the cached entry for the exact same params the matching
// getDomain* call above would use, so the client's next fetch is a genuine
// cache-miss instead of serving the (up to 12h stale) R2-cached result.
export const clearDomainOverviewCache = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(domainOverviewSchema)
  .handler(async ({ data, context }) => {
    const input = {
      ...data,
      ...resolveLabsMarket(data, context.project),
      projectId: context.projectId,
    };
    await DomainService.clearOverviewCache(input, context);
    return { cleared: true };
  });

export const clearDomainKeywordsCache = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(domainKeywordsPageRequestSchema)
  .handler(async ({ data, context }) => {
    const input = {
      ...data,
      ...resolveLabsMarket(data, context.project),
      projectId: context.projectId,
    };
    await DomainService.clearKeywordsPageCache(input, context);
    return { cleared: true };
  });

export const clearDomainPagesCache = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(domainPagesPageRequestSchema)
  .handler(async ({ data, context }) => {
    const input = {
      ...data,
      ...resolveLabsMarket(data, context.project),
      projectId: context.projectId,
    };
    await DomainService.clearPagesPageCache(input, context);
    return { cleared: true };
  });
