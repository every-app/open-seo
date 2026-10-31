import {
  and,
  avg,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  lt,
  sql,
  sum,
} from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  projects,
  webAnalyticsEvents,
  webAnalyticsSessions,
  webAnalyticsSites,
} from "@/db/schema";
import type { WebAnalyticsDimension } from "@/types/schemas/web-analytics";
import { bucketLength, type AnalyticsRange } from "../lib/range";

interface WebAnalyticsSite {
  id: string;
  projectId: string;
  organizationId: string;
  createdAt: string;
}

/** Site row plus the tracked domain from its project (for ingest validation). */
export interface WebAnalyticsSiteWithDomain extends WebAnalyticsSite {
  domain: string | null;
}

type SessionInsert = typeof webAnalyticsSessions.$inferInsert;
type EventInsert = typeof webAnalyticsEvents.$inferInsert;

// The write shapes ingestion produces. Applied as ONE atomic batch per event,
// mirroring Minilytics' D1 batch, so racing first events (a pageview and a
// goal arriving together) can never double count.
export type IngestOp =
  | { kind: "insertSession"; session: SessionInsert }
  | { kind: "insertEvent"; event: EventInsert }
  | {
      kind: "markPageview";
      siteId: string;
      sessionId: string;
      path: string;
      now: string;
    }
  | { kind: "markGoal"; siteId: string; sessionId: string; now: string }
  | { kind: "touchSession"; siteId: string; sessionId: string; now: string }
  | {
      kind: "addPing";
      siteId: string;
      sessionId: string;
      durationMs: number;
      now: string;
    };

async function getByProjectId(
  projectId: string,
): Promise<WebAnalyticsSite | null> {
  const [site] = await db
    .select()
    .from(webAnalyticsSites)
    .where(eq(webAnalyticsSites.projectId, projectId))
    .limit(1);
  return site ?? null;
}

async function getById(id: string): Promise<WebAnalyticsSiteWithDomain | null> {
  const [site] = await db
    .select({
      id: webAnalyticsSites.id,
      projectId: webAnalyticsSites.projectId,
      organizationId: webAnalyticsSites.organizationId,
      createdAt: webAnalyticsSites.createdAt,
      domain: projects.domain,
    })
    .from(webAnalyticsSites)
    .innerJoin(projects, eq(projects.id, webAnalyticsSites.projectId))
    .where(eq(webAnalyticsSites.id, id))
    .limit(1);
  return site ?? null;
}

async function create(site: WebAnalyticsSite): Promise<void> {
  await db.insert(webAnalyticsSites).values(site);
}

async function removeByProjectId(projectId: string): Promise<void> {
  await db
    .delete(webAnalyticsSites)
    .where(eq(webAnalyticsSites.projectId, projectId));
}

async function sessionExists(
  siteId: string,
  sessionId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ one: sql`1` })
    .from(webAnalyticsSessions)
    .where(
      and(
        eq(webAnalyticsSessions.siteId, siteId),
        eq(webAnalyticsSessions.id, sessionId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

async function applyIngestOps(ops: IngestOp[]): Promise<void> {
  if (ops.length === 0) return;
  await runBatch((tx) =>
    ops.map((op) => {
      switch (op.kind) {
        case "insertSession":
          return tx
            .insert(webAnalyticsSessions)
            .values(op.session)
            .onConflictDoNothing();
        case "insertEvent":
          return tx.insert(webAnalyticsEvents).values(op.event);
        case "markPageview":
          return tx
            .update(webAnalyticsSessions)
            .set({
              pageviews: sql`${webAnalyticsSessions.pageviews} + 1`,
              exitPage: op.path,
              lastSeenAt: op.now,
            })
            .where(
              and(
                eq(webAnalyticsSessions.siteId, op.siteId),
                eq(webAnalyticsSessions.id, op.sessionId),
              ),
            );
        case "markGoal":
          return tx
            .update(webAnalyticsSessions)
            .set({
              goals: sql`${webAnalyticsSessions.goals} + 1`,
              lastSeenAt: op.now,
            })
            .where(
              and(
                eq(webAnalyticsSessions.siteId, op.siteId),
                eq(webAnalyticsSessions.id, op.sessionId),
              ),
            );
        case "touchSession":
          return tx
            .update(webAnalyticsSessions)
            .set({ lastSeenAt: op.now })
            .where(
              and(
                eq(webAnalyticsSessions.siteId, op.siteId),
                eq(webAnalyticsSessions.id, op.sessionId),
              ),
            );
        case "addPing":
          return tx
            .update(webAnalyticsSessions)
            .set({
              durationMs: sql`${webAnalyticsSessions.durationMs} + ${op.durationMs}`,
              lastSeenAt: op.now,
            })
            .where(
              and(
                eq(webAnalyticsSessions.siteId, op.siteId),
                eq(webAnalyticsSessions.id, op.sessionId),
              ),
            );
      }
    }),
  );
}

export interface SessionKpis {
  visitors: number;
  sessions: number;
  pageviews: number;
  bounces: number;
  avgDurationMs: number;
}

async function getKpis(
  siteId: string,
  from: string,
  to: string,
): Promise<SessionKpis> {
  const [row] = await db
    .select({
      visitors: countDistinct(webAnalyticsSessions.visitorId),
      sessions: count(),
      pageviews: sum(webAnalyticsSessions.pageviews),
      bounces: sum(
        sql`CASE WHEN ${webAnalyticsSessions.pageviews} <= 1 AND ${webAnalyticsSessions.goals} = 0 THEN 1 ELSE 0 END`,
      ),
      avgDurationMs: avg(webAnalyticsSessions.durationMs),
    })
    .from(webAnalyticsSessions)
    .where(
      and(
        eq(webAnalyticsSessions.siteId, siteId),
        gte(webAnalyticsSessions.startedAt, from),
        lt(webAnalyticsSessions.startedAt, to),
      ),
    );
  return {
    visitors: row?.visitors ?? 0,
    sessions: row?.sessions ?? 0,
    pageviews: Number(row?.pageviews ?? 0),
    bounces: Number(row?.bounces ?? 0),
    avgDurationMs: Math.round(Number(row?.avgDurationMs ?? 0)),
  };
}

export interface SeriesRow {
  bucket: string;
  visitors: number;
  pageviews: number;
}

async function getSeries(
  siteId: string,
  range: AnalyticsRange,
): Promise<SeriesRow[]> {
  const bucket = sql`substr(${webAnalyticsSessions.startedAt}, 1, ${bucketLength(range.granularity)})`;
  const rows = await db
    .select({
      bucket,
      visitors: countDistinct(webAnalyticsSessions.visitorId),
      pageviews: sum(webAnalyticsSessions.pageviews),
    })
    .from(webAnalyticsSessions)
    .where(
      and(
        eq(webAnalyticsSessions.siteId, siteId),
        gte(webAnalyticsSessions.startedAt, range.from),
        lt(webAnalyticsSessions.startedAt, range.to),
      ),
    )
    .groupBy(bucket);
  return rows.map((row) => ({
    bucket: String(row.bucket),
    visitors: row.visitors,
    pageviews: Number(row.pageviews ?? 0),
  }));
}

async function countOnline(siteId: string, now: string): Promise<number> {
  const [row] = await db
    .select({ n: countDistinct(webAnalyticsSessions.visitorId) })
    .from(webAnalyticsSessions)
    .where(
      and(
        eq(webAnalyticsSessions.siteId, siteId),
        // "Online" = seen in the last 5 minutes, bounded by a 6h session age
        // so ancient half-open sessions never count.
        gte(
          webAnalyticsSessions.lastSeenAt,
          new Date(Date.parse(now) - 5 * 60_000).toISOString(),
        ),
        gte(
          webAnalyticsSessions.startedAt,
          new Date(Date.parse(now) - 6 * 3_600_000).toISOString(),
        ),
      ),
    );
  return row?.n ?? 0;
}

export interface BreakdownRow {
  label: string | null;
  visitors: number;
  pageviews: number;
}

const SESSION_DIMENSIONS = {
  entry_page: webAnalyticsSessions.entryPage,
  exit_page: webAnalyticsSessions.exitPage,
  source: webAnalyticsSessions.source,
  channel: webAnalyticsSessions.channel,
  country: webAnalyticsSessions.country,
  region: webAnalyticsSessions.region,
  city: webAnalyticsSessions.city,
  browser: webAnalyticsSessions.browser,
  os: webAnalyticsSessions.os,
  device: webAnalyticsSessions.device,
  referrer: webAnalyticsSessions.referrer,
  utm_source: webAnalyticsSessions.utmSource,
  utm_medium: webAnalyticsSessions.utmMedium,
  utm_campaign: webAnalyticsSessions.utmCampaign,
  utm_term: webAnalyticsSessions.utmTerm,
  utm_content: webAnalyticsSessions.utmContent,
  ref: webAnalyticsSessions.ref,
} as const;

type SessionDimension = keyof typeof SESSION_DIMENSIONS;

function isSessionDimension(
  dimension: WebAnalyticsDimension,
): dimension is SessionDimension {
  return dimension in SESSION_DIMENSIONS;
}

const EVENT_DIMENSIONS = {
  page: { type: "pageview", column: webAnalyticsEvents.path },
  goal: { type: "goal", column: webAnalyticsEvents.name },
  exit_link: { type: "outbound", column: webAnalyticsEvents.name },
} as const;

type EventDimension = keyof typeof EVENT_DIMENSIONS;

function isEventDimension(
  dimension: WebAnalyticsDimension,
): dimension is EventDimension {
  return dimension in EVENT_DIMENSIONS;
}

async function getBreakdown(
  siteId: string,
  dimension: WebAnalyticsDimension,
  range: AnalyticsRange,
  limit: number,
): Promise<BreakdownRow[]> {
  if (isSessionDimension(dimension)) {
    const column = SESSION_DIMENSIONS[dimension];
    const rows = await db
      .select({
        label: column,
        visitors: countDistinct(webAnalyticsSessions.visitorId),
        pageviews: sum(webAnalyticsSessions.pageviews),
      })
      .from(webAnalyticsSessions)
      .where(
        and(
          eq(webAnalyticsSessions.siteId, siteId),
          gte(webAnalyticsSessions.startedAt, range.from),
          lt(webAnalyticsSessions.startedAt, range.to),
        ),
      )
      .groupBy(column)
      .orderBy(desc(countDistinct(webAnalyticsSessions.visitorId)))
      .limit(limit);
    return rows.map((row) => ({
      label: row.label,
      visitors: row.visitors,
      pageviews: Number(row.pageviews ?? 0),
    }));
  }

  if (!isEventDimension(dimension)) {
    // Unreachable for schema-validated dimensions; kept as a hard stop.
    throw new Error("Unknown web analytics dimension.");
  }
  const eventDim = EVENT_DIMENSIONS[dimension];
  const rows = await db
    .select({
      label: eventDim.column,
      visitors: countDistinct(webAnalyticsEvents.visitorId),
      pageviews: count(),
    })
    .from(webAnalyticsEvents)
    .where(
      and(
        eq(webAnalyticsEvents.siteId, siteId),
        eq(webAnalyticsEvents.type, eventDim.type),
        gte(webAnalyticsEvents.ts, range.from),
        lt(webAnalyticsEvents.ts, range.to),
      ),
    )
    .groupBy(eventDim.column)
    .orderBy(desc(countDistinct(webAnalyticsEvents.visitorId)))
    .limit(limit);
  return rows.map((row) => ({
    label: row.label,
    visitors: row.visitors,
    pageviews: row.pageviews,
  }));
}

export const WebAnalyticsRepository = {
  getByProjectId,
  getById,
  create,
  removeByProjectId,
  sessionExists,
  applyIngestOps,
  getKpis,
  getSeries,
  countOnline,
  getBreakdown,
};
