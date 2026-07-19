import { PostHog } from "posthog-node";
import { and, count, eq, isNull, lt, or, sql } from "drizzle-orm";
import { version } from "../../../package.json";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import {
  audits,
  gscConnections,
  projects,
  rankTrackingKeywords,
  samSessions,
  savedKeywords,
  telemetryState,
  user,
} from "@/db/schema";
import { getAuthMode } from "@/lib/auth-mode";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";

const SELF_HOST_POSTHOG_KEY =
  "REDACTED";
const SELF_HOST_POSTHOG_HOST = "https://us.i.posthog.com";

const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const TELEMETRY_STATE_ID = 1;

type ClaimedHeartbeat = {
  installId: string;
  lastHeartbeatAt: Date | null;
  lastVersion: string | null;
  mcpToolCallCount: number;
};

type HeartbeatCounts = {
  userCount: number;
  projectCount: number;
  siteAuditCount: number;
  rankTrackingKeywordCount: number;
  savedKeywordCount: number;
  gscConnected: boolean;
  samChatUsed: boolean;
};

type HeartbeatProperties = HeartbeatCounts & {
  deployTarget: "cloudflare" | "docker";
  dbBackend: "d1" | "postgres";
  version: string;
  prevVersion?: string;
  firstRun: boolean;
  mcpToolCalls: number;
  $process_person_profile: false;
};

export type SelfHostTelemetryDependencies = {
  now: () => Date;
  isNonProductionBuild: () => boolean;
  claimHeartbeat: (now: Date) => Promise<ClaimedHeartbeat | null>;
  collectCounts: () => Promise<HeartbeatCounts>;
  sendHeartbeat: (
    installId: string,
    properties: HeartbeatProperties,
  ) => Promise<void>;
  markHeartbeatSent: (
    currentVersion: string,
    reportedMcpToolCalls: number,
  ) => Promise<void>;
  getDbBackend: () => "d1" | "postgres";
  version: string;
};

type SelfHostTelemetryOptions = {
  dependencies?: Partial<SelfHostTelemetryDependencies>;
  /** Lets unit tests exercise the database CAS as if calls came from separate isolates. */
  skipMemoryThrottle?: boolean;
};

let lastCheckedAt: number | null = null;

// Only production builds report: this excludes `vite dev`, vitest, and
// preview deployments (`vite build --mode preview`), whose per-PR databases
// would otherwise each register as a fresh self-host install.
function isNonProductionBuild() {
  return import.meta.env.MODE !== "production";
}

async function telemetryIsDisabled() {
  if (await isHostedServerAuthMode()) return true;
  if (await getOptionalEnvValue("OPENSEO_TELEMETRY_DISABLED")) return true;
  if (await getOptionalEnvValue("DO_NOT_TRACK")) return true;
  return false;
}

async function claimHeartbeat(now: Date): Promise<ClaimedHeartbeat | null> {
  await db
    .insert(telemetryState)
    .values({ id: TELEMETRY_STATE_ID, installId: crypto.randomUUID() })
    .onConflictDoNothing();

  const [previous] = await db
    .select({
      installId: telemetryState.installId,
      lastHeartbeatAt: telemetryState.lastHeartbeatAt,
      lastVersion: telemetryState.lastVersion,
      mcpToolCallCount: telemetryState.mcpToolCallCount,
    })
    .from(telemetryState)
    .where(eq(telemetryState.id, TELEMETRY_STATE_ID))
    .limit(1);

  if (!previous) return null;

  const cutoff = new Date(now.getTime() - HEARTBEAT_INTERVAL_MS);
  const [claimed] = await db
    .update(telemetryState)
    .set({ lastHeartbeatAt: now })
    .where(
      and(
        eq(telemetryState.id, TELEMETRY_STATE_ID),
        or(
          isNull(telemetryState.lastHeartbeatAt),
          lt(telemetryState.lastHeartbeatAt, cutoff),
        ),
      ),
    )
    .returning({ id: telemetryState.id });

  return claimed ? previous : null;
}

// No session-based activity counts: self-host auth is delegated per request
// (Cloudflare Access / local_noauth) and never creates better-auth session
// rows, so those queries would always report zero. Install-level activity
// falls out of heartbeat cadence instead — a heartbeat means an active day.
async function collectCounts(): Promise<HeartbeatCounts> {
  const [
    [userRow],
    [projectRow],
    [auditRow],
    [rankKeywordRow],
    [savedKeywordRow],
    [gscRow],
    [samRow],
  ] = await Promise.all([
    db.select({ value: count() }).from(user),
    db.select({ value: count() }).from(projects),
    db.select({ value: count() }).from(audits),
    db.select({ value: count() }).from(rankTrackingKeywords),
    db.select({ value: count() }).from(savedKeywords),
    db.select({ value: count() }).from(gscConnections),
    db.select({ value: count() }).from(samSessions),
  ]);

  return {
    userCount: userRow?.value ?? 0,
    projectCount: projectRow?.value ?? 0,
    siteAuditCount: auditRow?.value ?? 0,
    rankTrackingKeywordCount: rankKeywordRow?.value ?? 0,
    savedKeywordCount: savedKeywordRow?.value ?? 0,
    gscConnected: (gscRow?.value ?? 0) > 0,
    samChatUsed: (samRow?.value ?? 0) > 0,
  };
}

async function sendHeartbeat(
  installId: string,
  properties: HeartbeatProperties,
) {
  const client = new PostHog(SELF_HOST_POSTHOG_KEY, {
    host: SELF_HOST_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
    disableGeoip: true,
  });

  try {
    client.capture({
      distinctId: installId,
      event: "self_host.heartbeat",
      properties,
    });
  } finally {
    await client.shutdown();
  }
}

async function markHeartbeatSent(
  currentVersion: string,
  reportedMcpToolCalls: number,
) {
  await db
    .update(telemetryState)
    .set({
      lastVersion: currentVersion,
      // Preserve tool calls that race with the heartbeat send while clearing
      // exactly the count included in this event.
      mcpToolCallCount: sql`case
        when ${telemetryState.mcpToolCallCount} >= ${reportedMcpToolCalls}
        then ${telemetryState.mcpToolCallCount} - ${reportedMcpToolCalls}
        else 0
      end`,
    })
    .where(eq(telemetryState.id, TELEMETRY_STATE_ID));
}

const productionDependencies: SelfHostTelemetryDependencies = {
  now: () => new Date(),
  isNonProductionBuild,
  claimHeartbeat,
  collectCounts,
  sendHeartbeat,
  markHeartbeatSent,
  getDbBackend: getDatabaseProvider,
  version,
};

export async function maybeSendSelfHostHeartbeat(
  options: SelfHostTelemetryOptions = {},
) {
  try {
    if (await telemetryIsDisabled()) return;

    const dependencies = {
      ...productionDependencies,
      ...options.dependencies,
    };
    if (dependencies.isNonProductionBuild()) return;

    const now = dependencies.now();
    if (
      !options.skipMemoryThrottle &&
      lastCheckedAt !== null &&
      now.getTime() - lastCheckedAt < CHECK_INTERVAL_MS
    ) {
      return;
    }
    lastCheckedAt = now.getTime();

    const state = await dependencies.claimHeartbeat(now);
    if (!state) return;

    const authMode = getAuthMode(await getOptionalEnvValue("AUTH_MODE"));
    const counts = await dependencies.collectCounts();
    const prevVersion =
      state.lastVersion && state.lastVersion !== dependencies.version
        ? state.lastVersion
        : undefined;

    await dependencies.sendHeartbeat(state.installId, {
      deployTarget: authMode === "local_noauth" ? "docker" : "cloudflare",
      dbBackend: dependencies.getDbBackend(),
      version: dependencies.version,
      ...(prevVersion ? { prevVersion } : {}),
      firstRun: state.lastHeartbeatAt === null,
      ...counts,
      mcpToolCalls: state.mcpToolCallCount,
      $process_person_profile: false,
    });
    await dependencies.markHeartbeatSent(
      dependencies.version,
      state.mcpToolCallCount,
    );
  } catch (error) {
    console.debug("self-host telemetry heartbeat failed", error);
  }
}

export async function incrementSelfHostMcpToolCallCount() {
  try {
    if (await telemetryIsDisabled()) return;
    if (isNonProductionBuild()) return;

    await db
      .insert(telemetryState)
      .values({
        id: TELEMETRY_STATE_ID,
        installId: crypto.randomUUID(),
        mcpToolCallCount: 1,
      })
      .onConflictDoUpdate({
        target: telemetryState.id,
        set: {
          mcpToolCallCount: sql`${telemetryState.mcpToolCallCount} + 1`,
        },
      });
  } catch (error) {
    console.debug("self-host telemetry MCP counter failed", error);
  }
}
