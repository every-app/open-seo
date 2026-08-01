import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { routeAgentRequest } from "agents";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { SamSessionRepository } from "@/server/features/sam/SamSessionRepository";
import { runScheduledRankChecks } from "@/server/features/rank-tracking/services/scheduledRankChecks";
import { getOrCreateOrganizationCustomer } from "@/server/billing/subscription";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import type { RankTrackingKeywordScheduleInterval } from "@/types/schemas/rank-tracking";
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
import { withPgClient } from "@/db";
import {
  AUTUMN_WEBHOOK_PATH,
  handleAutumnWebhookRequest,
} from "@/server/billing/autumn-webhook";
import { maybeSendSelfHostHeartbeat } from "@/server/lib/self-host-telemetry";

const appFetch = createStartHandler(defaultStreamHandler);
const openSeoOAuthProvider = createOpenSeoOAuthProvider(appFetch);
const KEYWORD_INTERVALS_API_PATH = "/api/rank-tracking/keyword-intervals";
const KEYWORD_INTERVALS: ReadonlySet<string> =
  new Set<RankTrackingKeywordScheduleInterval>([
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

function getStringField(data: Record<string, unknown>, field: string): string {
  const value = data[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError("VALIDATION_ERROR", `${field} is required`);
  }
  return value;
}

function isKeywordInterval(
  value: unknown,
): value is RankTrackingKeywordScheduleInterval {
  return typeof value === "string" && KEYWORD_INTERVALS.has(value);
}

function getKeywordInterval(
  data: Record<string, unknown>,
): RankTrackingKeywordScheduleInterval {
  const value = data.scheduleIntervalOverride;
  if (!isKeywordInterval(value)) {
    throw new AppError("VALIDATION_ERROR", "Invalid keyword interval");
  }
  return value;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  if (!isJsonObject(body)) {
    throw new AppError("VALIDATION_ERROR", "Invalid JSON body");
  }
  return body;
}

async function authorizeProjectApiRequest(request: Request, projectId: string) {
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

// Authorize a SAM agent connection in the Worker, before it reaches the Durable
// Object. The DO instance name is the sessionId (set client-side); we resolve
// the session here and authorize the caller against the session's project via
// the same canonical project-access check the rest of the app uses, so the DO
// can trust its `name` and derive org/project/user from the session row.
async function authorizeSamChat(
  request: Request,
  sessionId: string,
): Promise<Response | undefined> {
  let context;
  try {
    context = await resolveUserContextFromHeaders(request.headers);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const session = await SamSessionRepository.getActiveSession(
    sessionId,
    context.userId,
  );
  const project = session
    ? await ProjectRepository.getProjectForOrganization(
        session.projectId,
        context.organizationId,
      )
    : null;
  if (!session || !project) {
    return new Response("Forbidden", { status: 403 });
  }
  // Same as onboarding above: make sure the Autumn customer (and its default
  // free-plan credits) exists before the DO's balance gate runs, or a brand-new
  // org's first message hits a false "out of credits".
  if (await isHostedServerAuthMode()) {
    await getOrCreateOrganizationCustomer(context);
  }
  return undefined;
}

// Both chat DOs live behind /agents/*. Dispatch on the DO binding partyserver
// resolved for the request (rather than re-parsing the path), and fail closed
// on anything unrecognized.
function authorizeChatAgent(
  request: Request,
  lobby: { className: string; name: string },
): Promise<Response | undefined> | Response {
  switch (lobby.className) {
    case "SAM_CHAT":
      return authorizeSamChat(request, lobby.name);
    case "ONBOARDING_CHAT":
      return authorizeOnboardingChat(request, lobby.name);
    default:
      return new Response("Forbidden", { status: 403 });
  }
}

// Route /agents/* to the onboarding and SAM chat DOs. Auth happens here (both
// the WS upgrade and any HTTP message-history fetch), keeping it off the OAuth
// wrapper and TanStack route guard below.
async function routeChatAgents(request: Request, env: Env): Promise<Response> {
  const response = await routeAgentRequest(request, env, {
    onBeforeConnect: (req, lobby) => authorizeChatAgent(req, lobby),
    onBeforeRequest: (req, lobby) => authorizeChatAgent(req, lobby),
  });
  return response ?? new Response("Not found", { status: 404 });
}

function fetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // Scope a per-request Postgres client (no-op in D1 mode). The client isn't
  // closed here — the Workers↔Hyperdrive socket is reclaimed at invocation end.
  return withPgClient(() => Promise.resolve(handleFetch(request, env, ctx)));
}

function handleFetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Response | Promise<Response> {
  ctx.waitUntil(maybeSendSelfHostHeartbeat());

  const authMode = getAuthMode(env.AUTH_MODE);
  const publicRequest = requestWithPublicOrigin(request);
  const pathname = new URL(publicRequest.url).pathname;

  if (pathname.startsWith("/agents/")) {
    return routeChatAgents(publicRequest, env);
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
// Durable Object class for the SAM in-app agent (Agents SDK).
export { SamChatAgent } from "./server/features/sam/SamChatAgent";

export default {
  fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ) {
    // Scope a per-request Postgres client for the cron run (no-op in D1 mode).
    await withPgClient(() => runScheduledRankChecks(env));
  },
};
