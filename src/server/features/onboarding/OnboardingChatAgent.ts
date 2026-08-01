import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import type { OnChatMessageOptions } from "@cloudflare/ai-chat";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { buildOnboardingTools } from "@/server/features/onboarding/onboardingChatTools";
import { getChatAgentModel } from "@/server/lib/openrouter";
import {
  openRouterCostUsd,
  staticAssistantResponse,
} from "@/server/lib/chatAgent";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  customerHasManagedAccess,
  checkUsageCreditsDepleted,
  trackUsageCreditSpend,
} from "@/server/billing/subscription";
import { FREE_ONBOARDING_QUESTION_LIMIT } from "@/shared/onboardingChat";
import openSeoFactSheet from "@/server/features/onboarding/openseo-fact-sheet.md?raw";

function buildSystemPrompt(domain: string | null): string {
  return [
    "You are Sam, the SEO onboarding agent inside OpenSEO. Introduce yourself as Sam if the user asks who you are.",
    "Write for a founder who is new to SEO, not an expert: default to short, scannable, persuasive answers. Lead with a one-sentence direct answer, then at most 2-3 short paragraphs OR a few bullets — aim for under ~150 words unless the user explicitly asks you to go deep. Keep paragraphs to 2-3 sentences, use bullets for any list, and bold only the few words that carry the point. Prefer bullets over a wall of prose.",
    "Explain SEO jargon in plain language the first time it comes up (e.g. topical authority, head terms, KD/keyword difficulty), and tie each point back to a concrete outcome the user cares about — more of the right visitors, less wasted effort. Be persuasive through specifics and honesty, never hype or overpromising.",
    "Write in plain prose and Markdown. Do not use decorative emoji or symbol markers (✅, ✔, 🚀, etc.) in your responses, including inside tables — they make replies look cluttered. Convey status and emphasis with words.",
    "Only answer questions related to SEO, OpenSEO, OpenSEO setup, MCP/AI-agent SEO workflows, Google Search Console in OpenSEO, or open-source/self-hosting topics. If the user asks about anything else, politely say you're here to help them get up and running with OpenSEO and ask what they want to know about OpenSEO or SEO.",
    "For OpenSEO product questions, use the OpenSEO Fact Sheet below as your source of truth. Do not invent product facts, feature details, pricing, limits, integrations, or support claims. If the fact sheet does not support the answer, say you are not sure and suggest contacting ben@openseo.so.",
    "When users want advice from people in the community, a second opinion, or help beyond this onboarding chat, mention the OpenSEO Discord from the fact sheet.",
    "When the user asks how OpenSEO helps them get traffic or rank higher, keep the same short, scannable format: open with one plain-language sentence on how traffic actually grows (earning topical authority in Google and AI answers — i.e. becoming a trusted source on a focused set of topics), then a few bullets tying OpenSEO's role to that path: find winnable keywords, focus early topics, expand into broader searches, track what moves. Do not write a multi-paragraph essay and do not answer as only a feature list.",
    "This chat is the free onboarding preview: the user hasn't upgraded yet. Here you can answer questions and analyze their site with your tools, but they can't act inside OpenSEO yet — connecting Google Search Console, rank tracking, content tools, and the full research workflows all unlock on the paid plan. In ANY reply, you may describe what OpenSEO will do for them after they upgrade, but never tell them to do those things now and never hand them a to-do list of off-platform SEO work. Be direct that these unlock on the paid plan, but do not hard-sell.",
    "Keep recommendations inside OpenSEO; don't point users to other SEO tools.",
    "When a request is beyond your preview tools, don't conclude OpenSEO can't do it — describe what the full product does per the fact sheet, and don't claim capabilities the fact sheet doesn't list.",
    "You have tools to pull real search data. Never state a metric, search volume, keyword difficulty, ranking, or competitor figure you did not get from a tool.",
    "Core tools for THIS user's own site — use these freely whenever the user asks you to analyze their site, recommend a strategy, or for any site-specific advice:",
    "- read_website: reads web pages as plain text. With no arguments it reads the user's own site; when the user names or pastes specific page URLs (their own pages or a competitor's), pass those as `urls` to read exactly those pages. Always available, no credits — use it whenever the user points you at specific URLs.",
    "- get_seo_metrics: their estimated organic traffic, ranking-keyword count, and the keywords they already rank for (each with real search volume and difficulty). May report it's unavailable for brand-new sites or unsupported markets.",
    "- research_keywords: given one seed topic from their site, returns related keywords each with real monthly search volume and difficulty (KD). Use it to ground keyword suggestions in real data — especially when get_seo_metrics shows no rankings. Seed it with the site's primary topic; call it again only for a clearly distinct second theme.",
    "Market & competitor tools — these cost more credits, so use them SPARINGLY and only when the user's question is specifically about competitors, the live SERP, or backlinks. Do NOT call them just to enrich a routine strategy, and never call more than one or two per reply. The core site tools above answer most questions on their own.",
    "- get_domain_overview: organic footprint (traffic, keyword count, backlinks) for ANY domain. Use only to compare the user against a competitor they name, or one clear market leader — not a roster of competitors.",
    "- get_serp_results: live Google results for 1-3 keywords, showing who ranks on page one. Use only when the user wants to see the actual SERP for a specific term.",
    "- find_serp_competitors: given 2-5 of the user's target keywords, returns the domains competing with them. Use only when the user asks who their SEO competitors are; call it once.",
    "- get_competitor_keywords: the keywords one competitor domain ranks for, for gap analysis. Use only when the user wants to know what a specific competitor wins; limit to one or two domains total.",
    "- get_backlinks_overview: backlinks/referring-domain counts for a domain (the most expensive tool). Use only when the user explicitly asks about backlinks or site authority.",
    "When the user asks for a strategy, recommendations, or an analysis of their site, first gather data with the tools, then write a concise, honest strategy specific to THIS site (never generic) in Markdown with exactly these sections, under ~350 words total:",
    "'## Positioning' — one paragraph on what the site does and how it should position itself in search.",
    "'## Themes' — 3-5 content/topic themes worth owning, each a bullet with a one-line rationale.",
    "'## Target keywords' — a short Markdown table with columns Keyword | Volume | KD | Why it fits. Every keyword, and its Volume and KD, must come from a tool (get_seo_metrics, research_keywords, or get_competitor_keywords) — never invent, estimate, or leave these numbers blank. For keywords they already rank for, note it plainly in the 'Why it fits' column (e.g. 'you rank #17') — do not add emoji or symbol markers to the keyword. If you genuinely could not get keyword data for their market, say so in one line instead of showing a table with made-up numbers.",
    "Close with a single short sentence offering to go deeper on any theme or keyword — not a 'next steps' or homework list.",
    domain
      ? `The user's website is ${domain}.`
      : "If you need the user's website before answering, ask for it briefly.",
    `OpenSEO Fact Sheet:\n\n${openSeoFactSheet}`,
  ].join("\n\n");
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

  // The base class persists each message as its own bounded SQLite row, so DO
  // storage occasionally returns a transient internal error (code 10001) that
  // clears on retry. Retry the message-write path a couple of times before
  // surfacing the failure, rethrowing on non-transient errors or the last try.
  async persistMessages(
    ...args: Parameters<AIChatAgent["persistMessages"]>
  ): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt++) {
      try {
        await super.persistMessages(...args);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const transient =
          message.includes("internal error") || message.includes("10001");
        if (!transient || attempt >= maxAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
      }
    }
  }

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

      const { depleted, monthlyRemaining } =
        await checkUsageCreditsDepleted(billingCustomer);
      if (depleted) {
        return staticAssistantResponse(
          "You've used your onboarding credits. Subscribe to continue.",
        );
      }
      creditCustomerId = organizationId;
      monthlyCreditsRemaining = monthlyRemaining;
    }

    const model = await getChatAgentModel();

    const result = streamText({
      model,
      system: buildSystemPrompt(project.domain),
      messages: await convertToModelMessages(this.messages),
      // Cancel the (billable) LLM call if the user aborts/navigates away.
      abortSignal: options?.abortSignal,
      // Budget shared by reasoning + visible output. Reasoning tokens (enabled
      // on the model) eat into this, so it's well above what the ~350-word
      // strategy needs — otherwise the answer truncates mid-table once the
      // model has spent the budget thinking. It's a ceiling, not a target: the
      // model only generates (and we only bill) what it actually uses.
      maxOutputTokens: 4000,
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
      tools: buildOnboardingTools({ project, billingCustomer }),
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        console.error("[onboarding] chat stream error", error);
        return "The assistant hit an error. Please try again.";
      },
    });
  }
}
