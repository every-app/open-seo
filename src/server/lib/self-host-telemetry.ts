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
  "phc_xaXj4vE4LikxfvR7q6EHemAYNBSZW4hQkqor7fpf8aGT";
const SELF_HOST_POSTHOG_HOST = "https://us.i.posthog.com";

const DAILY_HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;
// During the first two hours after install, heartbeat every 5 minutes so the
// day-0 snapshots show how far onboarding got before an install went quiet.
const ONBOARDING_WINDOW_MS = 2 * 60 * 60 * 1000;
const ONBOARDING_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
// In-memory DB-check throttle. During onboarding this must divide the
// 5-minute heartbeat interval cleanly — a coarser value (e.g. 4 minutes)
// aliases against it and stretches the effective cadence to 8+ minutes.
// An unknown age (fresh isolate) checks immediately to populate the cache.
const ONBOARDING_CHECK_INTERVAL_MS = 60 * 1000;
const STEADY_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const TELEMETRY_STATE_ID = 1;

export function getHeartbeatIntervalMs(installAgeMs: number) {
  return installAgeMs < ONBOARDING_WINDOW_MS
    ? ONBOARDING_HEARTBEAT_INTERVAL_MS
    : DAILY_HEARTBEAT_INTERVAL_MS;
}

export function getCheckIntervalMs(installAgeMs: number | null) {
  if (installAgeMs === null) return 0;
  return installAgeMs < ONBOARDING_WINDOW_MS
    ? ONBOARDING_CHECK_INTERVAL_MS
    : STEADY_CHECK_INTERVAL_MS;
}

type ClaimedHeartbeat = {
  installId: string;
  installedAt: Date | null;
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
  minutesSinceInstall?: number;
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
// Populated by claimHeartbeat so the memory throttle can pick the right
// check interval without a DB read. Epoch 0 marks "old install, age unknown".
let cachedInstalledAt: Date | null = null;

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
  const selectState = () =>
    db
      .select({
        installId: telemetryState.installId,
        installedAt: telemetryState.installedAt,
        lastHeartbeatAt: telemetryState.lastHeartbeatAt,
        lastVersion: telemetryState.lastVersion,
        mcpToolCallCount: telemetryState.mcpToolCallCount,
      })
      .from(telemetryState)
      .where(eq(telemetryState.id, TELEMETRY_STATE_ID))
      .limit(1);

  let [previous] = await selectState();
  if (!previous) {
    await db
      .insert(telemetryState)
      .values({
        id: TELEMETRY_STATE_ID,
        installId: crypto.randomUUID(),
        installedAt: now,
      })
      .onConflictDoNothing();
    [previous] = await selectState();
  }

  if (!previous) return null;

  cachedInstalledAt = previous.installedAt ?? new Date(0);

  // Rows created before the installedAt column existed (or with a wiped
  // value) fall back to the daily cadence.
  const installAgeMs = previous.installedAt
    ? now.getTime() - previous.installedAt.getTime()
    : Number.POSITIVE_INFINITY;
  const cutoff = new Date(now.getTime() - getHeartbeatIntervalMs(installAgeMs));
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
    const checkIntervalMs = getCheckIntervalMs(
      cachedInstalledAt ? now.getTime() - cachedInstalledAt.getTime() : null,
    );
    if (
      !options.skipMemoryThrottle &&
      lastCheckedAt !== null &&
      now.getTime() - lastCheckedAt < checkIntervalMs
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

    const minutesSinceInstall = state.installedAt
      ? Math.round((now.getTime() - state.installedAt.getTime()) / 60_000)
      : undefined;

    await dependencies.sendHeartbeat(state.installId, {
      deployTarget: authMode === "local_noauth" ? "docker" : "cloudflare",
      dbBackend: dependencies.getDbBackend(),
      version: dependencies.version,
      ...(prevVersion ? { prevVersion } : {}),
      firstRun: state.lastHeartbeatAt === null,
      ...(minutesSinceInstall === undefined ? {} : { minutesSinceInstall }),
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
        installedAt: new Date(),
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
