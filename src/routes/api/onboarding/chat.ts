import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { AppError } from "@/server/lib/errors";
import { responseForAppError } from "@/server/lib/http-errors";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { runOnboardingSeed } from "@/server/features/onboarding/seed";
import { getOnboardingModel } from "@/server/lib/openrouter";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  customerHasManagedAccess,
  getOrCreateOrganizationCustomer,
} from "@/server/billing/subscription";
import { FREE_ONBOARDING_QUESTION_LIMIT } from "@/shared/onboardingChat";
import { LOCATIONS } from "@/shared/keyword-locations";
import openSeoFactSheet from "@/server/features/onboarding/openseo-fact-sheet.md?raw";

// Bound the conversation so a single authed user can't drive an unbounded LLM
// context (the chat is a free, pre-paywall surface).
const MAX_MESSAGES = 40;

const bodySchema = z.object({
  projectId: z.string().min(1),
  // Validate `role` structurally (keeping the UIMessage type) so a caller can't
  // smuggle in messages with a bogus role to dodge the free-question count.
  messages: z
    .array(
      z
        .custom<UIMessage>()
        .and(z.object({ role: z.enum(["user", "assistant", "tool"]) })),
    )
    .max(MAX_MESSAGES),
});

function buildSystemPrompt(domain: string | null): string {
  return [
    "You are Sam, the SEO onboarding agent inside OpenSEO. Introduce yourself as Sam if the user asks who you are.",
    "Answer SEO questions concisely and practically.",
    "Only answer questions related to SEO, OpenSEO, OpenSEO setup, MCP/AI-agent SEO workflows, Google Search Console in OpenSEO, or open-source/self-hosting topics. If the user asks about anything else, politely say you're here to help them get up and running with OpenSEO and ask what they want to know about OpenSEO or SEO.",
    "For OpenSEO product questions, use the OpenSEO Fact Sheet below as your source of truth. Do not invent product facts, feature details, pricing, limits, integrations, or support claims. If the fact sheet does not support the answer, say you are not sure and suggest contacting ben@openseo.so.",
    "When users want advice from people in the community, a second opinion, or help beyond this onboarding chat, mention the OpenSEO Discord from the fact sheet.",
    "When the user asks how OpenSEO helps them get traffic or rank higher, lead with the fact sheet's SEO strategy framing: positioning, topical authority, focused early topics, then expansion into broader searches. Do not answer as only a feature list.",
    "OpenSEO is limited until the user upgrades to the paid plan. Be direct about that, but do not hard-sell.",
    "When the user asks you to show, propose, generate, draft, or analyze an SEO strategy, call generate_initial_strategy.",
    domain
      ? `The user's website is ${domain}.`
      : "If you need the user's website before answering, ask for it briefly.",
    `OpenSEO Fact Sheet:\n\n${openSeoFactSheet}`,
  ].join("\n\n");
}

async function handleChat(request: Request): Promise<Response> {
  const context = await resolveUserContextFromHeaders(request.headers);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid chat request");
  }
  const body = parsed.data;

  // Authorize the requested project against the caller's organization.
  const project = await ProjectRepository.getProjectForOrganization(
    body.projectId,
    context.organizationId,
  );
  if (!project) {
    throw new AppError("FORBIDDEN");
  }

  // Free-plan cap. The client disables the composer once the limit is reached,
  // so this is the server-side backstop for a request that bypassed it. Only
  // pay for the (network) access check once a request is actually over the
  // limit — the common case stays a single round-trip.
  // Count only user-role messages to match the client gate (roles are already
  // validated by bodySchema above).
  const questionCount = body.messages.filter((m) => m.role === "user").length;
  if (questionCount > FREE_ONBOARDING_QUESTION_LIMIT) {
    const hosted = await isHostedServerAuthMode();
    if (hosted) {
      const customer = await getOrCreateOrganizationCustomer(context);
      if (!(await customerHasManagedAccess(customer.id))) {
        throw new AppError(
          "PAYMENT_REQUIRED",
          "You've used all your free strategy questions. Subscribe to continue.",
        );
      }
    }
  }

  const model = await getOnboardingModel();
  const modelMessages = await convertToModelMessages(body.messages);

  const result = streamText({
    model,
    system: buildSystemPrompt(project.domain),
    messages: modelMessages,
    abortSignal: request.signal,
    maxOutputTokens: 1600,
    stopWhen: stepCountIs(4),
    tools: {
      generate_initial_strategy: tool({
        description:
          "Read the user's website, gather available SEO signals, and synthesize an onboarding SEO strategy to present to the user. Use when the user asks Sam to propose a strategy or analyze their site.",
        inputSchema: z.object({}),
        execute: async () => {
          if (!project.domain) {
            throw new AppError(
              "VALIDATION_ERROR",
              "Set a website domain first",
            );
          }
          const seed = await runOnboardingSeed({
            projectId: project.id,
            billingCustomer: {
              userId: context.userId,
              userEmail: context.userEmail,
              organizationId: context.organizationId,
              projectId: project.id,
            },
            emailVerified: context.emailVerified,
            domain: project.domain,
            countryName: LOCATIONS[project.locationCode] ?? "your market",
            locationCode: project.locationCode,
            languageCode: project.languageCode,
          });

          if (seed.status === "complete") {
            return { status: "complete", markdown: seed.markdown };
          }
          return {
            status: "skipped",
            note: "A strategy was already generated for this site during onboarding. Present the one shown earlier in this conversation, or suggest the user upgrade to keep refining it in the app.",
          };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    onError: () => "The assistant hit an error. Please try again.",
  });
}

export const Route = createFileRoute("/api/onboarding/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          return await handleChat(request);
        } catch (error) {
          return responseForAppError(error, "Chat failed");
        }
      },
    },
  },
});
