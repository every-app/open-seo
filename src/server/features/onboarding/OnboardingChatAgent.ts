import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import type { OnChatMessageOptions } from "@cloudflare/ai-chat";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { readSite } from "@/server/features/onboarding/scrape";
import { DomainService } from "@/server/features/domain/services/DomainService";
import { KeywordResearchService } from "@/server/features/keywords/services/KeywordResearchService";
import { getOnboardingModel } from "@/server/lib/openrouter";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  customerHasManagedAccess,
  getUsageCreditsRemaining,
  trackUsageCreditSpend,
} from "@/server/billing/subscription";
import { FREE_ONBOARDING_QUESTION_LIMIT } from "@/shared/onboardingChat";
import { isLabsLocationCode, LOCATIONS } from "@/shared/keyword-locations";
import openSeoFactSheet from "@/server/features/onboarding/openseo-fact-sheet.md?raw";

// OpenRouter (with usage accounting on) reports the real USD cost of each
// response under providerMetadata.openrouter.usage.cost.
const openRouterUsageSchema = z.object({
  openrouter: z.object({ usage: z.object({ cost: z.number() }) }),
});

function openRouterCostUsd(providerMetadata: unknown): number {
  const parsed = openRouterUsageSchema.safeParse(providerMetadata);
  return parsed.success ? parsed.data.openrouter.usage.cost : 0;
}

function buildSystemPrompt(domain: string | null): string {
  return [
    "You are Sam, the SEO onboarding agent inside OpenSEO. Introduce yourself as Sam if the user asks who you are.",
    "Answer SEO questions concisely and practically.",
    "Only answer questions related to SEO, OpenSEO, OpenSEO setup, MCP/AI-agent SEO workflows, Google Search Console in OpenSEO, or open-source/self-hosting topics. If the user asks about anything else, politely say you're here to help them get up and running with OpenSEO and ask what they want to know about OpenSEO or SEO.",
    "For OpenSEO product questions, use the OpenSEO Fact Sheet below as your source of truth. Do not invent product facts, feature details, pricing, limits, integrations, or support claims. If the fact sheet does not support the answer, say you are not sure and suggest contacting ben@openseo.so.",
    "When users want advice from people in the community, a second opinion, or help beyond this onboarding chat, mention the OpenSEO Discord from the fact sheet.",
    "When the user asks how OpenSEO helps them get traffic or rank higher, lead with the fact sheet's SEO strategy framing: positioning, topical authority, focused early topics, then expansion into broader searches. Do not answer as only a feature list.",
    "This chat is the free onboarding preview: the user hasn't upgraded yet. Here you can answer questions and analyze their site with your tools, but they can't act inside OpenSEO yet — connecting Google Search Console, rank tracking, content tools, and the full research workflows all unlock on the paid plan. In ANY reply, you may describe what OpenSEO will do for them after they upgrade, but never tell them to do those things now and never hand them a to-do list of off-platform SEO work. Be direct that these unlock on the paid plan, but do not hard-sell.",
    "You have three tools to analyze THIS user's own site. Use them whenever the user asks you to analyze their site, recommend a strategy, or for any site-specific advice. Never state a metric, search volume, or keyword difficulty you did not get from a tool.",
    "- read_website: reads their pages as plain text. Always available.",
    "- get_seo_metrics: their estimated organic traffic, ranking-keyword count, and the keywords they already rank for (each with real search volume and difficulty). May report it's unavailable for brand-new sites or unsupported markets.",
    "- research_keywords: given one seed topic from their site, returns related keywords each with real monthly search volume and difficulty (KD). Use it to ground keyword suggestions in real data — especially when get_seo_metrics shows no rankings. Seed it with the site's primary topic; call it again only for a clearly distinct second theme.",
    "When the user asks for a strategy, recommendations, or an analysis of their site, first gather data with the tools, then write a concise, honest strategy specific to THIS site (never generic) in Markdown with exactly these sections, under ~350 words total:",
    "'## Positioning' — one paragraph on what the site does and how it should position itself in search.",
    "'## Themes' — 3-5 content/topic themes worth owning, each a bullet with a one-line rationale.",
    "'## Target keywords' — a short Markdown table with columns Keyword | Volume | KD | Why it fits. Every keyword, and its Volume and KD, must come from get_seo_metrics or research_keywords — never invent, estimate, or leave these numbers blank. Mark keywords they already rank for. If you genuinely could not get keyword data for their market, say so in one line instead of showing a table with made-up numbers.",
    "Close with a single short sentence offering to go deeper on any theme or keyword — not a 'next steps' or homework list.",
    domain
      ? `The user's website is ${domain}.`
      : "If you need the user's website before answering, ask for it briefly.",
    `OpenSEO Fact Sheet:\n\n${openSeoFactSheet}`,
  ].join("\n\n");
}

// A non-LLM assistant turn streamed back over the chat protocol. Used to surface
// billing gates ("Subscribe to continue") without spending an LLM call — the
// client renders it as a normal message from Sam.
function staticAssistantResponse(text: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = crypto.randomUUID();
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

/**
 * Durable Object backing the onboarding strategy chat. The conversation is
 * persisted automatically in the DO's SQLite (`this.messages`), so it survives
 * reloads. One instance per project: the DO instance name IS the projectId, set
 * by the client (`useAgent({ name: projectId })`) and authorized in the Worker
 * (`onBeforeConnect`) before any connection reaches here — so the DO trusts that
 * its caller may act on `this.name` and derives the org/domain from the project.
 */
export class OnboardingChatAgent extends AIChatAgent {
  // Cap stored history; the onboarding chat is short and pre-paywall.
  maxPersistedMessages = 60;

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions,
  ): Promise<Response | undefined> {
    const project = await ProjectRepository.getProjectById(this.name);
    if (!project) {
      return staticAssistantResponse(
        "I couldn't find your project. Please refresh and try again.",
      );
    }
    const { organizationId } = project;
    const billingCustomer = {
      // The org is the Autumn customer; userId is only an analytics distinctId.
      userId: organizationId,
      // The DO only knows the org/project, not the user, so it has no real email
      // to attach. The org's Autumn customer is already created with the real
      // email by the Worker's authorize step before any message reaches here, so
      // this placeholder is only ever seen by a get-on-existing (never persisted)
      // — Autumn rejects an empty string. Mirrors the scheduled rank-check job's
      // user-less metering, but onboarding-specific so it's identifiable in
      // Autumn logs.
      userEmail: "system-onboarding@openseo.so",
      organizationId,
      projectId: project.id,
    };
    const metering = { creditFeature: "onboarding" as const };

    // In hosted mode, gate every turn on billing: past the free-question cap the
    // user must have paid access, and either way the org must still have credits
    // — LLM tokens and DataForSEO tool calls all draw down the same
    // onboarding-plan balance. Self-hosted has no Autumn balance and brings its
    // own provider keys, so it's ungated. Captured for metering in onFinish.
    let creditCustomerId: string | null = null;
    let monthlyCreditsRemaining = 0;
    if (await isHostedServerAuthMode()) {
      const questionCount = this.messages.filter(
        (message) => message.role === "user",
      ).length;
      if (
        questionCount > FREE_ONBOARDING_QUESTION_LIMIT &&
        !(await customerHasManagedAccess(organizationId))
      ) {
        return staticAssistantResponse(
          "You've used all your free strategy questions. Subscribe to continue.",
        );
      }

      const { monthlyRemaining, topupRemaining } =
        await getUsageCreditsRemaining(organizationId);
      if (monthlyRemaining + topupRemaining <= 0) {
        return staticAssistantResponse(
          "You've used your onboarding credits. Subscribe to continue.",
        );
      }
      creditCustomerId = organizationId;
      monthlyCreditsRemaining = monthlyRemaining;
    }

    const model = await getOnboardingModel();

    // `tools` is widened to ToolSet so streamText infers a generic tool set;
    // that makes its onFinish event assignable to the
    // StreamTextOnFinishCallback<ToolSet> we forward for message persistence.
    const result = streamText({
      model,
      system: buildSystemPrompt(project.domain),
      messages: await convertToModelMessages(this.messages),
      // Cancel the (billable) LLM call if the user aborts/navigates away.
      abortSignal: options?.abortSignal,
      maxOutputTokens: 1600,
      stopWhen: stepCountIs(5),
      // Meter LLM spend against the same credit pool as DataForSEO: sum the real
      // per-step cost OpenRouter reports and deduct it. Best-effort, hosted-only.
      onFinish: async (event) => {
        if (creditCustomerId !== null) {
          const costUsd = event.steps.reduce(
            (sum, step) => sum + openRouterCostUsd(step.providerMetadata),
            0,
          );
          await trackUsageCreditSpend({
            customer: billingCustomer,
            customerId: creditCustomerId,
            creditFeature: "onboarding",
            costUsd,
            monthlyRemaining: monthlyCreditsRemaining,
            properties: { provider: "openrouter" },
          });
        }
        // Persist the assistant turn to this.messages (DO SQLite).
        await onFinish(event);
      },
      tools: {
        read_website: tool({
          description:
            "Read the user's own website (their pages, as plain text) to ground site-specific advice and strategy. Uses the project's saved domain.",
          inputSchema: z.object({}),
          execute: async () => {
            if (!project.domain) {
              throw new AppError(
                "VALIDATION_ERROR",
                "Set a website domain first",
              );
            }
            const site = await readSite(project.domain);
            if (site.blocked) {
              return {
                blocked: true,
                pages: [],
                note: "Could not read the site's pages. Ask the user to describe what they do, and keep the advice high-level.",
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
              throw new AppError(
                "VALIDATION_ERROR",
                "Set a website domain first",
              );
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
              throw new AppError(
                "VALIDATION_ERROR",
                "Set a website domain first",
              );
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
                // Keep only keywords with a real volume — the strategy table
                // shows volume + KD, so a null-volume row can't be grounded.
                .filter((row) => row.searchVolume != null)
                .toSorted(
                  (a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0),
                )
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
      } as ToolSet,
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        console.error("[onboarding] chat stream error", error);
        return "The assistant hit an error. Please try again.";
      },
    });
  }
}
