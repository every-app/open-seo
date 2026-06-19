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
    "OpenSEO is limited until the user upgrades to the paid plan. Be direct about that, but do not hard-sell.",
    "You have tools to research the user's own site: read_website reads their pages as text, and get_seo_metrics returns their estimated organic traffic, ranking-keyword count, and the keywords they already rank for. Use them whenever the user asks you to analyze their site, recommend an SEO strategy, or for any site-specific advice. read_website is always available; get_seo_metrics may report it's unavailable for brand-new sites or unsupported markets — if so, work from the site content and say rankings aren't available yet. Never invent metrics you weren't given by a tool.",
    "When the user asks for a strategy, recommendations, or an analysis of their site, first gather data with the tools, then write a concise, practical, honest strategy specific to THIS site (never generic) in Markdown with these sections: '## Positioning' (one paragraph on what the site does and how it should position itself in search); '## Themes' (3-5 content/topic themes worth owning, each a bullet with a one-line rationale); '## Target keywords' (a short Markdown table of starter keywords with columns Keyword | Why it fits — prefer and mark keywords they already rank for; if the site is brand new with no rankings, say so plainly and propose keywords from the content); '## Do this next' (a numbered list of 3-5 concrete next actions). Keep the whole strategy under ~400 words.",
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
      userEmail: "",
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
          },
        }),
      } as ToolSet,
    });

    return result.toUIMessageStreamResponse({
      onError: () => "The assistant hit an error. Please try again.",
    });
  }
}
