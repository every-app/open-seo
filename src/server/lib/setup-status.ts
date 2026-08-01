import { count } from "drizzle-orm";
import { version } from "../../../package.json";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getAuthMode } from "@/lib/auth-mode";
import { runSelfhostChecks } from "@/lib/selfhost-preflight";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// "error" blocks core functionality; "warn" degrades a feature.
type SetupCheck = {
  status: "ok" | "warn" | "error";
  detail?: string;
};

type SelfHostSetupStatus = {
  version: string;
  authMode: string;
  checks: Record<string, SetupCheck>;
};

// The same env vars the Docker preflight validates; /api/health re-runs the
// shared checks against runtime env so the two reports can never drift.
const CHECK_ENV_VARS = [
  "AUTH_MODE",
  "TEAM_DOMAIN",
  "POLICY_AUD",
  "DATAFORSEO_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "OPENROUTER_API_KEY",
] as const;

const LEVEL_TO_STATUS = {
  ok: "ok",
  info: "ok",
  warn: "warn",
  fail: "error",
} as const;

async function checkDatabase(): Promise<SetupCheck> {
  try {
    await db.select({ value: count() }).from(projects);
    return { status: "ok" };
  } catch (error) {
    // This endpoint is unauthenticated: never surface raw driver messages
    // (they can name hosts and DB users). The real error goes to the logs.
    console.error("health check: database query failed", error);
    return {
      status: "error",
      detail: "Database query failed — check server logs.",
    };
  }
}

export async function getSelfHostSetupStatus(options?: {
  skipDatabaseCheck?: boolean;
}): Promise<SelfHostSetupStatus> {
  const env = Object.fromEntries(
    await Promise.all(
      CHECK_ENV_VARS.map(
        async (name) => [name, await getOptionalEnvValue(name)] as const,
      ),
    ),
  );

  const checks: Record<string, SetupCheck> = {};
  for (const item of runSelfhostChecks(env)) {
    checks[item.key] = {
      status: LEVEL_TO_STATUS[item.level],
      detail: item.message,
    };
  }
  checks.database = options?.skipDatabaseCheck
    ? { status: "ok" }
    : await checkDatabase();

  return { version, authMode: getAuthMode(env.AUTH_MODE), checks };
}

// Compact "which checks are unhealthy" list for telemetry: check keys with
// their status, no free-text details (details can name env vars; keep events
// to enumerable values only).
export async function getSetupIssueSummary(): Promise<string[]> {
  const status = await getSelfHostSetupStatus({ skipDatabaseCheck: true });
  return Object.entries(status.checks)
    .filter(([, check]) => check.status !== "ok")
    .map(([key, check]) => `${key}:${check.status}`);
}
