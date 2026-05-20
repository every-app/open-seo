import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  domainOverviewSchema,
  domainKeywordSuggestionsSchema,
  domainKeywordsPageRequestSchema,
  domainPagesPageRequestSchema,
} from "@/types/schemas/domain";
import { DomainService } from "@/server/features/domain/services/DomainService";

function shouldUseDomainE2eFixtures() {
  return import.meta.env.VITE_E2E_DOMAIN_FIXTURES === "1";
}

async function getDomainE2eFixtures() {
  return import("../../e2e/fixtures/domain-overview-fixtures");
}

export const getDomainOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => domainOverviewSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (shouldUseDomainE2eFixtures()) {
      const fixtures = await getDomainE2eFixtures();
      return fixtures.getFixtureOverview(data.domain);
    }

    return DomainService.getOverview(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    );
  });

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

export const getDomainKeywordsPage = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) =>
    domainKeywordsPageRequestSchema.parse(data),
  )
  .handler(async ({ data, context }) => {
    if (shouldUseDomainE2eFixtures()) {
      const fixtures = await getDomainE2eFixtures();
      return fixtures.getFixtureKeywordsPage(data);
    }

    return DomainService.getKeywordsPage(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    );
  });

export const getDomainPagesPage = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => domainPagesPageRequestSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (shouldUseDomainE2eFixtures()) {
      const fixtures = await getDomainE2eFixtures();
      return fixtures.getFixturePagesPage(data);
    }

    return DomainService.getPagesPage(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    );
  });
