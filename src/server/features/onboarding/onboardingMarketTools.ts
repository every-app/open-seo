import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { DomainService } from "@/server/features/domain/services/DomainService";
import { BacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import { isLabsLocationCode, LOCATIONS } from "@/shared/keyword-locations";
import type { ToolContext } from "@/server/features/onboarding/onboardingChatTools";

// Tools that analyze any domain / the wider market (domain overview, SERP,
// competitors, competitor keywords, backlinks). These cost more credits, so the
// system prompt tells Sam to use them sparingly.
export function marketTools(ctx: ToolContext): ToolSet {
  const { project, organizationId, billingCustomer, metering, dfsClient } = ctx;
  const { isSameDomain } = ctx;
  return {
    get_domain_overview: tool({
      description:
        "Get a high-level organic-search footprint for ANY domain (estimated organic traffic and ranking-keyword count). Use it to compare the user against a named competitor or reference site. For backlinks/authority use get_backlinks_overview. Costs credits — only call when the user asks how they compare to a competitor or about the wider market.",
      inputSchema: z.object({
        domain: z
          .string()
          .min(1)
          .describe(
            "The competitor or reference domain to look up, e.g. 'cyberark.com'.",
          ),
      }),
      execute: async ({ domain }) => {
        if (!isLabsLocationCode(project.locationCode)) {
          return {
            available: false,
            reason:
              "Competitor data isn't available for this market yet. Work from the site content instead.",
          };
        }
        try {
          const overview = await DomainService.getOverview(
            {
              projectId: project.id,
              domain,
              includeSubdomains: false,
              locationCode: project.locationCode,
              languageCode: project.languageCode,
            },
            billingCustomer,
            metering,
          );
          return {
            available: true,
            domain,
            market: LOCATIONS[project.locationCode] ?? "your market",
            hasData: overview.hasData,
            organicTraffic: overview.organicTraffic,
            organicKeywords: overview.organicKeywords,
          };
        } catch (error) {
          console.error("[onboarding] get_domain_overview failed", {
            domain,
            error,
          });
          throw error;
        }
      },
    }),
    get_serp_results: tool({
      description:
        "Fetch live Google search results for 1-3 keywords to show who currently ranks on page one. Use it when the user wants to see the real SERP for a target term or judge how hard a keyword looks. Costs credits per keyword — keep to the few keywords that matter.",
      inputSchema: z.object({
        keywords: z
          .array(z.string().min(1))
          .min(1)
          .max(3)
          .describe("1-3 search queries to inspect."),
      }),
      execute: async ({ keywords }) => {
        const results = await Promise.all(
          keywords.map(async (keyword) => {
            try {
              const items = await dfsClient.serp.live({
                keyword,
                locationCode: project.locationCode,
                languageCode: project.languageCode,
                creditFeature: "onboarding",
              });
              return {
                keyword,
                ok: true as const,
                results: items
                  .filter((item) => item.type === "organic")
                  .slice(0, 10)
                  .map((item) => ({
                    rank: item.rank_absolute ?? item.rank_group ?? null,
                    domain: item.domain ?? null,
                    title: item.title ?? null,
                    url: item.url ?? null,
                  })),
              };
            } catch (error) {
              return {
                keyword,
                ok: false as const,
                error: error instanceof Error ? error.message : "failed",
              };
            }
          }),
        );
        return { results };
      },
    }),
    find_serp_competitors: tool({
      description:
        "Given a small set of the user's target keywords, find the domains that compete with them in Google results (with each competitor's keyword coverage and estimated traffic). Use it when the user asks who their SEO competitors are. Costs credits — call once with the best 2-5 keywords, not repeatedly.",
      inputSchema: z.object({
        keywords: z
          .array(z.string().min(1))
          .min(1)
          .max(5)
          .describe(
            "2-5 of the user's most important target keywords, drawn from their site or rankings.",
          ),
      }),
      execute: async ({ keywords }) => {
        if (!isLabsLocationCode(project.locationCode)) {
          return {
            available: false,
            reason: "Competitor data isn't available for this market yet.",
          };
        }
        try {
          const competitors = await dfsClient.labs.serpCompetitors({
            keywords,
            locationCode: project.locationCode,
            languageCode: project.languageCode,
            limit: 50,
            creditFeature: "onboarding",
          });
          const top = competitors
            .filter((c) => !isSameDomain(c.domain))
            .toSorted((a, b) => (b.etv ?? 0) - (a.etv ?? 0))
            .slice(0, 10)
            .map((c) => ({
              domain: c.domain ?? null,
              keywordsCount: c.keywords_count ?? null,
              avgPosition: c.avg_position ?? null,
              estimatedTraffic: c.etv ?? null,
            }));
          return { available: true, competitors: top };
        } catch (error) {
          console.error("[onboarding] find_serp_competitors failed", {
            keywords,
            error,
          });
          throw error;
        }
      },
    }),
    get_competitor_keywords: tool({
      description:
        "List the keywords a competitor or reference domain already ranks for (keyword, position, search volume, difficulty). Use it to find gaps — terms a competitor wins that the user could target. Costs credits — call for at most one or two competitor domains.",
      inputSchema: z.object({
        domain: z
          .string()
          .min(1)
          .describe("The competitor domain to inspect, e.g. 'cyberark.com'."),
      }),
      execute: async ({ domain }) => {
        if (!isLabsLocationCode(project.locationCode)) {
          return {
            available: false,
            reason: "Competitor data isn't available for this market yet.",
          };
        }
        try {
          // Reuse the shared service (12h cache + mapKeywordItem) so this
          // matches get_seo_metrics rather than re-parsing raw SDK rows.
          const ranked = await DomainService.getSuggestedKeywords(
            {
              domain,
              locationCode: project.locationCode,
              languageCode: project.languageCode,
              organizationId,
              projectId: project.id,
            },
            billingCustomer,
            metering,
          );
          const keywords = ranked.slice(0, 25).map((kw) => ({
            keyword: kw.keyword,
            position: kw.position,
            searchVolume: kw.searchVolume,
            keywordDifficulty: kw.keywordDifficulty,
          }));
          return {
            available: keywords.length > 0,
            domain,
            keywords,
          };
        } catch (error) {
          console.error("[onboarding] get_competitor_keywords failed", {
            domain,
            error,
          });
          throw error;
        }
      },
    }),
    get_backlinks_overview: tool({
      description:
        "Get a backlinks summary for the user's site or a competitor (total backlinks, referring domains). Backlinks signal how much authority a site has earned. Costs credits (this is the most expensive tool) — only call when the user explicitly asks about backlinks or authority.",
      inputSchema: z.object({
        domain: z
          .string()
          .min(1)
          .describe(
            "Domain to analyze. Use the user's own domain unless they name a competitor.",
          ),
      }),
      execute: async ({ domain }) => {
        try {
          const { overview } = await BacklinksService.profileOverview(
            { target: domain, scope: "domain" },
            billingCustomer,
            "onboarding",
          );
          return {
            available: true,
            domain,
            backlinks: overview.summary.backlinks,
            referringDomains: overview.summary.referringDomains,
            referringPages: overview.summary.referringPages,
          };
        } catch (error) {
          console.error("[onboarding] get_backlinks_overview failed", {
            domain,
            error,
          });
          throw error;
        }
      },
    }),
  } as ToolSet;
}
