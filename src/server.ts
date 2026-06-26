import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { routeAgentRequest } from "agents";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  rankTrackingConfigs,
  rankTrackingKeywords,
} from "@/db/schema";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import {
  RankTrackingService,
  type RankTrackingKeywordScheduleInterval,
} from "@/server/features/rank-tracking/services/RankTrackingService";
import { beginRankCheckRun } from "@/server/features/rank-tracking/services/rankCheckRunGuards";
import {
  customerHasPaidPlan,
  getOrCreateOrganizationCustomer,
} from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
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
const KEYWORD_INTERVALS_API_PATH = "/api/rank-tracking/keyword-intervals";
const KEYWORD_INTERVALS = new Set<RankTrackingKeywordScheduleInterval>([
  "inherit",
  "daily",
  "weekly",
  "manual-paused",
]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getStringField(
  data: Record<string, unknown>,
  field: string,
): string {
  const value = data[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError("VALIDATION_ERROR", `${field} is required`);
  }
  return value;
}

function getKeywordInterval(
  data: Record<string, unknown>,
): RankTrackingKeywordScheduleInterval {
  const value = data.scheduleIntervalOverride;
  if (typeof value !== "string" || !KEYWORD_INTERVALS.has(value as never)) {
    throw new AppError("VALIDATION_ERROR", "Invalid keyword interval");
  }
  return value as RankTrackingKeywordScheduleInterval;
}

async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError("VALIDATION_ERROR", "Invalid JSON body");
  }
  return body as Record<string, unknown>;
}

async function authorizeProjectApiRequest(
  request: Request,
  projectId: string,
) {
  let context;
  try {
    context = await resolveUserContextFromHeaders(request.headers);
  } catch {
    throw new AppError("UNAUTHENTICATED", "Unauthorized");
  }

  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    context.organizationId,
  );
  if (!project) {
    throw new AppError("FORBIDDEN", "Forbidden");
  }
}

async function handleKeywordIntervalsApiRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "PATCH") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const url = new URL(request.url);
    const data =
      request.method === "GET"
        ? Object.fromEntries(url.searchParams)
        : await readJsonObject(request);
    const projectId = getStringField(data, "projectId");
    const configId = getStringField(data, "configId");

    await authorizeProjectApiRequest(request, projectId);

    if (request.method === "GET") {
      return jsonResponse(
        await RankTrackingService.getKeywordSchedules(configId, projectId),
      );
    }

    const keywordIds = data.keywordIds;
    if (
      !Array.isArray(keywordIds) ||
      keywordIds.length === 0 ||
      !keywordIds.every((id) => typeof id === "string")
    ) {
      throw new AppError("VALIDATION_ERROR", "Select at least one keyword");
    }

    const result = await RankTrackingService.updateKeywordScheduleOverride(
      configId,
      projectId,
      keywordIds,
      getKeywordInterval(data),
    );
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof AppError) {
      const status =
        error.code === "UNAUTHENTICATED"
          ? 401
          : error.code === "FORBIDDEN"
            ? 403
            : error.code === "VALIDATION_ERROR"
              ? 400
              : 500;
      return jsonResponse({ error: error.message }, status);
    }

    console.error("[rank-tracking] keyword interval API error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}

async function getDueRankTrackingConfigs(nowIso: string) {
  return db
    .select({
      id: rankTrackingConfigs.id,
      projectId: rankTrackingConfigs.projectId,
      domain: rankTrackingConfigs.domain,
      locationCode: rankTrackingConfigs.locationCode,
      languageCode: rankTrackingConfigs.languageCode,
      devices: rankTrackingConfigs.devices,
      serpDepth: rankTrackingConfigs.serpDepth,
      scheduleInterval: rankTrackingConfigs.scheduleInterval,
      nextCheckAt: rankTrackingConfigs.nextCheckAt,
      organizationId: projects.organizationId,
    })
    .from(rankTrackingConfigs)
    .innerJoin(projects, eq(rankTrackingConfigs.projectId, projects.id))
    .where(
      and(
        eq(rankTrackingConfigs.isActive, true),
        isNull(projects.archivedAt),
        or(
          lte(rankTrackingConfigs.nextCheckAt, nowIso),
          sql`exists (
            select 1
            from ${rankTrackingKeywords}
            where ${rankTrackingKeywords.configId} = ${rankTrackingConfigs.id}
              and ${rankTrackingKeywords.scheduleIntervalOverride} in ('daily', 'weekly')
              and (
                ${rankTrackingKeywords.nextCheckAt} is null
                or ${rankTrackingKeywords.nextCheckAt} <= ${nowIso}
              )
          )`,
        ),
      ),
    )
    .limit(50);
}

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

  if (pathname === KEYWORD_INTERVALS_API_PATH) {
    return handleKeywordIntervalsApiRequest(publicRequest);
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
    const dueConfigs = await getDueRankTrackingConfigs(nowIso);

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
        const keywords = await RankTrackingRepository.getKeywordsForConfig(
          config.id,
        );
        if (keywords.length === 0) {
          console.log(
            `[cron] Skipping config ${config.id} (${config.domain}) — no keywords`,
          );
          // Still advance schedule so this config doesn't stay due forever
          // (manual configs have no interval, so they are never auto-advanced).
          const skipInterval =
            (config.scheduleInterval === "daily" ||
              config.scheduleInterval === "weekly") &&
            RankTrackingService.isConfigScheduleDue(config, nowIso)
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

        const dueKeywords = RankTrackingService.getDueKeywordsForScheduledRun(
          config,
          keywords,
          nowIso,
        );
        if (dueKeywords.length === 0) {
          console.log(
            `[cron] Skipping config ${config.id} (${config.domain}) — no due keywords`,
          );
          if (RankTrackingService.isConfigScheduleDue(config, nowIso)) {
            await RankTrackingRepository.updateConfig(
              config.id,
              config.projectId,
              {
                nextCheckAt: computeNextCheckAt(
                  config.scheduleInterval as "daily" | "weekly",
                  config.nextCheckAt,
                ),
              },
            );
          }
          continue;
        }

        // Advance nextCheckAt immediately to prevent retry storms if the run fails
        // (manual configs have no interval, so they are never auto-advanced).
        const interval =
          (config.scheduleInterval === "daily" ||
            config.scheduleInterval === "weekly") &&
          RankTrackingService.isConfigScheduleDue(config, nowIso)
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
        await RankTrackingService.advanceKeywordSchedulesForScheduledRun(
          dueKeywords,
        );

        const keywordIds =
          dueKeywords.length === keywords.length
            ? undefined
            : dueKeywords.map((keyword) => keyword.id);

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
          keywordsTotal: keywordIds ? keywordIds.length : keywords.length,
          keywordIds,
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
