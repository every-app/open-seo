import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { routeAgentRequest } from "agents";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { beginRankCheckRun } from "@/server/features/rank-tracking/services/rankCheckRunGuards";
import {
  customerHasPaidPlan,
  getOrCreateOrganizationCustomer,
} from "@/server/billing/subscription";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { getAuthMode, isHostedAuthMode } from "@/lib/auth-mode";
import {
  createOpenSeoOAuthProvider,
  type OpenSeoOAuthEnv,
} from "@/server/mcp/oauth-provider";
import { requestWithPublicOrigin } from "@/server/mcp/public-origin";
import { MCP_ROUTE } from "@/server/mcp/context";
import { handleSelfHostedOpenSeoMcpRequest } from "@/server/mcp/transport";
import { computeNextCheckAt } from "@/shared/rank-tracking";
import {
  AUTUMN_WEBHOOK_PATH,
  handleAutumnWebhookRequest,
} from "@/server/billing/autumn-webhook";

const appFetch = createStartHandler(defaultStreamHandler);
const openSeoOAuthProvider = createOpenSeoOAuthProvider(appFetch);

// Authorize an onboarding-chat connection in the Worker, before it reaches the
// Durable Object. The DO instance name is the projectId (set client-side); we
// resolve the session here and confirm the caller's org owns that project, so
// the DO can trust its `name`. Returning a Response rejects; void lets it through.
async function authorizeOnboardingChat(
  request: Request,
  projectId: string,
): Promise<Response | undefined> {
  let context;
  try {
    context = await resolveUserContextFromHeaders(request.headers);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    context.organizationId,
  );
  if (!project) {
    return new Response("Forbidden", { status: 403 });
  }
  // Ensure the org's Autumn customer exists (and gets its default onboarding-plan
  // credits) before the DO checks the balance — otherwise a brand-new org's first
  // message can hit a false "out of credits" gate. Hosted-only; self-hosted has
  // no Autumn.
  if (await isHostedServerAuthMode()) {
    await getOrCreateOrganizationCustomer(context);
  }
  return undefined;
}

// Route /agents/* to the onboarding chat DO. Auth happens here (both the WS
// upgrade and any HTTP message-history fetch), keeping it off the OAuth wrapper
// and TanStack route guard below.
async function routeOnboardingChatAgent(
  request: Request,
  env: Env,
): Promise<Response> {
  const response = await routeAgentRequest(request, env, {
    onBeforeConnect: (req, lobby) => authorizeOnboardingChat(req, lobby.name),
    onBeforeRequest: (req, lobby) => authorizeOnboardingChat(req, lobby.name),
  });
  return response ?? new Response("Not found", { status: 404 });
}

function fetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Response | Promise<Response> {
  const authMode = getAuthMode(env.AUTH_MODE);
  const publicRequest = requestWithPublicOrigin(request);
  const pathname = new URL(publicRequest.url).pathname;

  if (pathname.startsWith("/agents/")) {
    return routeOnboardingChatAgent(publicRequest, env);
  }

  if (isHostedAuthMode(authMode)) {
    if (pathname === AUTUMN_WEBHOOK_PATH) {
      return handleAutumnWebhookRequest(publicRequest);
    }

    return openSeoOAuthProvider.fetch(
      publicRequest,
      env as OpenSeoOAuthEnv,
      ctx,
    );
  }

  if (
    (authMode === "cloudflare_access" || authMode === "local_noauth") &&
    pathname === MCP_ROUTE
  ) {
    return handleSelfHostedOpenSeoMcpRequest(publicRequest, authMode, env, ctx);
  }

  return appFetch(request);
}

// Export Workflow classes as named exports
export { SiteAuditWorkflow } from "./server/workflows/SiteAuditWorkflow";
export { RankCheckWorkflow } from "./server/workflows/RankCheckWorkflow";
// Durable Object class for the onboarding strategy chat (Agents SDK).
export { OnboardingChatAgent } from "./server/features/onboarding/OnboardingChatAgent";

export default {
  fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ) {
    const nowIso = new Date().toISOString();
    const dueConfigs =
      await RankTrackingRepository.getDueConfigsWithOrganization(nowIso);

    const isHosted = await isHostedServerAuthMode();

    for (const config of dueConfigs) {
      try {
        // Skip configs whose org doesn't have a paid plan
        if (isHosted && !(await customerHasPaidPlan(config.organizationId))) {
          console.log(
            `[cron] Skipping config ${config.id} (${config.domain}) — org ${config.organizationId} no longer has access`,
          );
          continue;
        }

        // Skip configs with no keywords before advancing the schedule
        const kwCount = await RankTrackingRepository.getKeywordCountForConfig(
          config.id,
        );
        if (kwCount === 0) {
          console.log(
            `[cron] Skipping config ${config.id} (${config.domain}) — no keywords`,
          );
          // Still advance schedule so this config doesn't stay due forever
          const skipInterval =
            config.scheduleInterval === "daily" ||
            config.scheduleInterval === "weekly"
              ? config.scheduleInterval
              : null;
          if (skipInterval) {
            await RankTrackingRepository.updateConfig(
              config.id,
              config.projectId,
              {
                nextCheckAt: computeNextCheckAt(
                  skipInterval,
                  config.nextCheckAt,
                ),
              },
            );
          }
          continue;
        }

        // Advance nextCheckAt immediately to prevent retry storms if the run fails
        const interval =
          config.scheduleInterval === "daily" ||
          config.scheduleInterval === "weekly"
            ? config.scheduleInterval
            : null;
        if (interval) {
          await RankTrackingRepository.updateConfig(
            config.id,
            config.projectId,
            {
              nextCheckAt: computeNextCheckAt(interval, config.nextCheckAt),
            },
          );
        }

        const result = await beginRankCheckRun({
          workflow: env.RANK_CHECK_WORKFLOW,
          config,
          projectId: config.projectId,
          billingCustomer: {
            userId: "system",
            userEmail: "system@openseo.so",
            organizationId: config.organizationId,
            projectId: config.projectId,
          },
          keywordsTotal: kwCount,
          trigger: "scheduled",
          workflowStartErrorMessage: "Failed to start scheduled workflow",
        });

        if (!result.ok) {
          console.log(
            `[cron] Skipping config ${config.id} (${config.domain}) — run already active`,
          );
        } else {
          console.log(
            `[cron] Started scheduled rank check ${result.runId} for config ${config.id} (${config.domain})`,
          );
        }
      } catch (err) {
        console.error(
          `[cron] Error processing config ${config.id} (${config.domain}):`,
          err,
        );
      }
    }
  },
};
