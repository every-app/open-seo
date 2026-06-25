import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import {
  MAX_PAGES,
  readPages,
  readSite,
} from "@/server/features/onboarding/scrape";
import { DomainService } from "@/server/features/domain/services/DomainService";
import { KeywordResearchService } from "@/server/features/keywords/services/KeywordResearchService";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { marketTools } from "@/server/features/onboarding/onboardingMarketTools";
import { isLabsLocationCode, LOCATIONS } from "@/shared/keyword-locations";
import type { BillingCustomerContext } from "@/server/billing/subscription";

// Just the project fields the tools read; the caller passes the full project row.
type OnboardingProject = {
  id: string;
  domain: string | null;
  locationCode: number;
  languageCode: string;
  organizationId: string;
};

// Shared context derived once per turn and passed to each tool group.
export type ToolContext = {
  project: OnboardingProject;
  organizationId: string;
  billingCustomer: BillingCustomerContext;
  metering: { creditFeature: "onboarding" };
  dfsClient: ReturnType<typeof createDataforseoClient>;
  isSameDomain: (domain: unknown) => boolean;
};

/**
 * Builds the tool set the onboarding chat agent hands to `streamText`. Split out
 * of OnboardingChatAgent so the agent file (and onChatMessage) stays readable.
 *
 * Two tiers: the core tools analyze the user's own site; the market tools look
 * at any domain and cost more credits — the system prompt tells Sam to use them
 * sparingly. Every metered DataForSEO call is attributed to the "onboarding"
 * credit feature. The result is widened to ToolSet so streamText infers a
 * generic tool set, keeping its onFinish event assignable to the
 * StreamTextOnFinishCallback<ToolSet> the agent forwards for persistence.
 */
export function buildOnboardingTools({
  project,
  billingCustomer,
}: {
  project: OnboardingProject;
  billingCustomer: BillingCustomerContext;
}): ToolSet {
  // Normalized form of the user's own domain, used to drop self-matches from
  // competitor results.
  const ownDomain = project.domain
    ? project.domain.replace(/^www\./, "").toLowerCase()
    : null;
  const ctx: ToolContext = {
    project,
    organizationId: project.organizationId,
    billingCustomer,
    metering: { creditFeature: "onboarding" },
    // Each metered call passes `creditFeature: "onboarding"` so spend lands on
    // the onboarding line; the org's balance is asserted by the agent first.
    dfsClient: createDataforseoClient(billingCustomer),
    isSameDomain: (domain) =>
      ownDomain != null &&
      typeof domain === "string" &&
      domain.replace(/^www\./, "").toLowerCase() === ownDomain,
  };

  return { ...coreSiteTools(ctx), ...marketTools(ctx) } as ToolSet;
}

// Tools that analyze the user's own site (read_website, get_seo_metrics,
// research_keywords). Used freely per the system prompt.
function coreSiteTools(ctx: ToolContext): ToolSet {
  const { project, organizationId, billingCustomer, metering } = ctx;
  return {
    read_website: tool({
      description:
        "Read web pages as plain text to ground advice. With no arguments, reads the user's own site (homepage plus a few pages from its sitemap) from the project's saved domain. Pass `urls` to read specific pages the user names instead — particular pages of their site, or a competitor's page to compare. Always available; uses no credits.",
      inputSchema: z.object({
        urls: z
          .array(z.string().url())
          .max(MAX_PAGES)
          .optional()
          .describe(
            `Specific page URLs to read (max ${MAX_PAGES}). Omit to read the user's own site from its saved domain.`,
          ),
      }),
      execute: async ({ urls }) => {
        const site =
          urls && urls.length > 0
            ? await readPages(urls)
            : project.domain
              ? await readSite(project.domain)
              : null;
        if (!site) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Provide page URLs to read, or set a website domain first.",
          );
        }
        if (site.blocked) {
          return {
            blocked: true,
            pages: [],
            note: "Could not read the requested page(s). Ask the user to describe what they cover, and keep the advice high-level.",
          };
        }
        return {
          blocked: false,
          pages: site.pages.map((page) => ({
            url: page.url,
            title: page.title,
            text: page.text,
          })),
        };
      },
    }),
    get_seo_metrics: tool({
      description:
        "Get search-data signal for the user's own site: estimated organic traffic, number of ranking keywords, and the keywords they already rank for (top by traffic). Use to ground strategy in real rankings. May report unavailable for brand-new sites or unsupported markets.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!project.domain) {
          throw new AppError("VALIDATION_ERROR", "Set a website domain first");
        }
        // Domain endpoints are Labs-only, so an unsupported market gets
        // content-only advice. Spend is bounded by the org's credit balance,
        // already asserted for the turn.
        if (!isLabsLocationCode(project.locationCode)) {
          return {
            available: false,
            reason:
              "Ranking data isn't available for this market yet. Work from the site content instead.",
          };
        }

        try {
          // Fetch the overview and ranked keywords in parallel so the tool
          // doesn't block on the two DataForSEO calls in series. Trade-off:
          // this always issues the (metered) ranked-keywords call, even for
          // sites with no rankings where the sequential version skipped it.
          const [overview, ranked] = await Promise.all([
            DomainService.getOverview(
              {
                projectId: project.id,
                domain: project.domain,
                includeSubdomains: false,
                locationCode: project.locationCode,
                languageCode: project.languageCode,
              },
              billingCustomer,
              metering,
            ),
            DomainService.getSuggestedKeywords(
              {
                domain: project.domain,
                locationCode: project.locationCode,
                languageCode: project.languageCode,
                organizationId,
                projectId: project.id,
              },
              billingCustomer,
              metering,
            ),
          ]);

          const rankedKeywords = overview.hasData
            ? ranked.slice(0, 20).map((kw) => ({
                keyword: kw.keyword,
                position: kw.position,
                searchVolume: kw.searchVolume,
                keywordDifficulty: kw.keywordDifficulty,
              }))
            : [];

          return {
            available: true,
            market: LOCATIONS[project.locationCode] ?? "your market",
            hasRankings: overview.hasData,
            organicTraffic: overview.organicTraffic,
            organicKeywords: overview.organicKeywords,
            rankedKeywords,
          };
        } catch (error) {
          console.error("[onboarding] get_seo_metrics failed", {
            domain: project.domain,
            locationCode: project.locationCode,
            languageCode: project.languageCode,
            error,
          });
          throw error;
        }
      },
    }),
    research_keywords: tool({
      description:
        "Research real keyword ideas for the user's site. Given one seed topic drawn from their content, returns related keywords each with monthly search volume, keyword difficulty (KD), and intent. Use to ground keyword suggestions in real data, especially when the site has no rankings yet.",
      inputSchema: z.object({
        seed: z
          .string()
          .min(1)
          .describe(
            "A short seed topic or phrase from the site's content (e.g. 'agentless PAM').",
          ),
      }),
      execute: async ({ seed }) => {
        if (!project.domain) {
          throw new AppError("VALIDATION_ERROR", "Set a website domain first");
        }
        try {
          const researchResult = await KeywordResearchService.research(
            {
              projectId: project.id,
              keywords: [seed],
              locationCode: project.locationCode,
              languageCode: project.languageCode,
              resultLimit: 150,
              // One source (keyword_ideas) keeps onboarding spend to a single
              // DataForSEO call; research() routes unsupported markets to the
              // Google Ads fallback automatically.
              mode: "ideas",
              clickstream: false,
            },
            billingCustomer,
            "onboarding",
          );

          const keywords = researchResult.rows
            // Keep only keywords with a real volume — the strategy table shows
            // volume + KD, so a null-volume row can't be grounded.
            .filter((row) => row.searchVolume != null)
            .toSorted((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
            .map((row) => ({
              keyword: row.keyword,
              searchVolume: row.searchVolume,
              keywordDifficulty: row.keywordDifficulty,
              intent: row.intent,
            }));

          return { available: keywords.length > 0, keywords };
        } catch (error) {
          console.error("[onboarding] research_keywords failed", {
            domain: project.domain,
            seed,
            locationCode: project.locationCode,
            languageCode: project.languageCode,
            error,
          });
          throw error;
        }
      },
    }),
  } as ToolSet;
}
