import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { db } from "@/db";
import {
  bingConnections,
  indexnowConfigs,
  indexingEvents,
  projects,
} from "@/db/schema";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { BingApiError, BingTokenError } from "@/server/lib/bingClient";
import { BingService } from "@/server/features/bing/services/BingService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

const PULSE_DIGEST_PATH =
  "/Users/ramai/.openclaw/workspace/memory/seo-pulse-digest.md";
const WAR_ROOM_PATH = "/Users/ramai/.openclaw/workspace/clients/seo-warroom.md";

export const getSeoPulseDigest = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    try {
      const content = await readFile(PULSE_DIGEST_PATH, "utf-8");
      return content;
    } catch {
      return null;
    }
  });

export const getSeoWarRoom = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    try {
      const content = await readFile(WAR_ROOM_PATH, "utf-8");
      return content;
    } catch {
      return null;
    }
  });

const WAR_ROOM_INDEXING_EVENT_LIMIT = 50;
const WAR_ROOM_BING_ISSUE_LIMIT = 10;

type WarRoomIndexingEventStatus = "pending" | "success" | "error";
type WarRoomIndexingEventType = "submitted" | "verified" | "failed" | "expired";

type WarRoomIndexingEventCounts = {
  pending: number;
  success: number;
  error: number;
  total: number;
};

export type WarRoomIndexingTelemetry = {
  projects: Array<{
    projectId: string;
    projectName: string;
    domain: string | null;
    config: {
      host: string | null;
      enabled: boolean;
      createdAt: string | null;
      updatedAt: string | null;
    } | null;
    eventCounts: WarRoomIndexingEventCounts;
  }>;
  recentEvents: Array<{
    id: string;
    projectId: string;
    projectName: string;
    url: string;
    eventType: WarRoomIndexingEventType;
    status: WarRoomIndexingEventStatus;
    httpStatus: number | null;
    attempts: number;
    createdAt: string;
    updatedAt: string;
  }>;
  totals: WarRoomIndexingEventCounts & {
    configuredProjects: number;
    enabledProjects: number;
  };
};

export type WarRoomBingTelemetry = {
  fetchedAt: string;
  projects: Array<{
    projectId: string;
    projectName: string;
    domain: string | null;
    connected: boolean;
    siteUrl: string | null;
    connectedAccountEmail: string | null;
    connectedAt: string | null;
    updatedAt: string | null;
    visibilitySummary: string | null;
    visibilityError: string | null;
    crawlIssues: string[];
    crawlIssueCount: number | null;
    crawlIssuesError: string | null;
  }>;
  connectedProjects: number;
};

function emptyIndexingEventCounts(): WarRoomIndexingEventCounts {
  return {
    pending: 0,
    success: 0,
    error: 0,
    total: 0,
  };
}

/**
 * Read the IndexNow config and event ledger for the active projects in the
 * authenticated organization. The key itself and response bodies stay on the
 * server; the War Room only needs operational status and recent activity.
 */
export const getWarRoomIndexingTelemetry = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }): Promise<WarRoomIndexingTelemetry> => {
    const activeProjects = await ProjectRepository.listProjects(
      context.organizationId,
    );

    const [configRows, countRows, recentEventRows] = await Promise.all([
      db
        .select({
          projectId: indexnowConfigs.projectId,
          host: indexnowConfigs.host,
          enabled: indexnowConfigs.enabled,
          createdAt: indexnowConfigs.createdAt,
          updatedAt: indexnowConfigs.updatedAt,
        })
        .from(indexnowConfigs)
        .innerJoin(projects, eq(indexnowConfigs.projectId, projects.id))
        .where(
          and(
            eq(indexnowConfigs.organizationId, context.organizationId),
            eq(projects.organizationId, context.organizationId),
            isNull(projects.archivedAt),
          ),
        ),
      db
        .select({
          projectId: indexingEvents.projectId,
          status: indexingEvents.status,
          total: count(),
        })
        .from(indexingEvents)
        .innerJoin(projects, eq(indexingEvents.projectId, projects.id))
        .where(
          and(
            eq(indexingEvents.organizationId, context.organizationId),
            eq(projects.organizationId, context.organizationId),
            isNull(projects.archivedAt),
          ),
        )
        .groupBy(indexingEvents.projectId, indexingEvents.status),
      db
        .select({
          id: indexingEvents.id,
          projectId: indexingEvents.projectId,
          projectName: projects.name,
          url: indexingEvents.url,
          eventType: indexingEvents.eventType,
          status: indexingEvents.status,
          httpStatus: indexingEvents.httpStatus,
          attempts: indexingEvents.attempts,
          createdAt: indexingEvents.createdAt,
          updatedAt: indexingEvents.updatedAt,
        })
        .from(indexingEvents)
        .innerJoin(projects, eq(indexingEvents.projectId, projects.id))
        .where(
          and(
            eq(indexingEvents.organizationId, context.organizationId),
            eq(projects.organizationId, context.organizationId),
            isNull(projects.archivedAt),
          ),
        )
        .orderBy(desc(indexingEvents.createdAt), desc(indexingEvents.id))
        .limit(WAR_ROOM_INDEXING_EVENT_LIMIT),
    ]);

    const configsByProjectId = new Map(
      configRows.map((config) => [config.projectId, config]),
    );
    const countsByProjectId = new Map<
      string,
      ReturnType<typeof emptyIndexingEventCounts>
    >();

    for (const row of countRows) {
      const counts =
        countsByProjectId.get(row.projectId) ?? emptyIndexingEventCounts();
      const rowCount = Number(row.total);
      counts.total += rowCount;
      if (row.status === "pending") counts.pending += rowCount;
      if (row.status === "success") counts.success += rowCount;
      if (row.status === "error") counts.error += rowCount;
      countsByProjectId.set(row.projectId, counts);
    }

    const telemetryProjects = activeProjects.map((project) => ({
      projectId: project.id,
      projectName: project.name,
      domain: project.domain,
      config: configsByProjectId.has(project.id)
        ? {
            host: configsByProjectId.get(project.id)?.host ?? null,
            enabled: configsByProjectId.get(project.id)?.enabled ?? false,
            createdAt: configsByProjectId.get(project.id)?.createdAt ?? null,
            updatedAt: configsByProjectId.get(project.id)?.updatedAt ?? null,
          }
        : null,
      eventCounts:
        countsByProjectId.get(project.id) ?? emptyIndexingEventCounts(),
    }));

    const totals = telemetryProjects.reduce((summary, project) => {
      summary.pending += project.eventCounts.pending;
      summary.success += project.eventCounts.success;
      summary.error += project.eventCounts.error;
      summary.total += project.eventCounts.total;
      return summary;
    }, emptyIndexingEventCounts());

    return {
      projects: telemetryProjects,
      recentEvents: recentEventRows,
      totals: {
        configuredProjects: telemetryProjects.filter(
          (project) => project.config !== null,
        ).length,
        enabledProjects: telemetryProjects.filter(
          (project) => project.config?.enabled === true,
        ).length,
        ...totals,
      },
    };
  });

function summarizeBingValue(value: unknown): string {
  if (value === null || value === undefined) return "No data";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) return `${value.length} rows returned`;
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(
        ([, entryValue]) =>
          typeof entryValue === "string" ||
          typeof entryValue === "number" ||
          typeof entryValue === "boolean",
      )
      .slice(0, 3);
    if (entries.length > 0) {
      return entries
        .map(([key, entryValue]) => `${key}: ${String(entryValue)}`)
        .join(" · ");
    }
  }
  return "Data returned";
}

function summarizeBingIssue(issue: unknown): string {
  if (typeof issue === "string") return issue;
  if (typeof issue === "object" && issue !== null) {
    const entries = Object.entries(issue)
      .filter(
        ([, value]) =>
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean",
      )
      .slice(0, 2);
    if (entries.length > 0) {
      return entries
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" · ");
    }
  }
  return summarizeBingValue(issue);
}

function describeBingTelemetryError(error: unknown): string {
  if (error instanceof BingTokenError) {
    return "The Bing connection has expired or was revoked.";
  }
  if (error instanceof BingApiError) {
    return error.message;
  }
  return "Bing telemetry is temporarily unavailable.";
}

/**
 * Read Bing connections from the organization's database rows, then fetch the
 * connected property's visibility and crawl issues through Bing's read-only
 * API. A provider failure is returned per project so one expired grant does
 * not hide the other projects' telemetry.
 */
export const getWarRoomBingTelemetry = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }): Promise<WarRoomBingTelemetry> => {
    const activeProjects = await ProjectRepository.listProjects(
      context.organizationId,
    );
    const connectionRows = await db
      .select({
        projectId: bingConnections.projectId,
        siteUrl: bingConnections.siteUrl,
        connectedAccountEmail: bingConnections.connectedAccountEmail,
        createdAt: bingConnections.createdAt,
        updatedAt: bingConnections.updatedAt,
      })
      .from(bingConnections)
      .innerJoin(projects, eq(bingConnections.projectId, projects.id))
      .where(
        and(
          eq(bingConnections.organizationId, context.organizationId),
          eq(projects.organizationId, context.organizationId),
          isNull(projects.archivedAt),
        ),
      );

    const connectionsByProjectId = new Map(
      connectionRows.map((connection) => [connection.projectId, connection]),
    );

    const telemetryProjects = await Promise.all(
      activeProjects.map(async (project) => {
        const connection = connectionsByProjectId.get(project.id);
        if (!connection) {
          return {
            projectId: project.id,
            projectName: project.name,
            domain: project.domain,
            connected: false as const,
            siteUrl: null,
            connectedAccountEmail: null,
            connectedAt: null,
            updatedAt: null,
            visibilitySummary: null,
            visibilityError: null,
            crawlIssues: [],
            crawlIssueCount: null,
            crawlIssuesError: null,
          };
        }

        const [visibilityResult, crawlIssuesResult] = await Promise.allSettled([
          BingService.getVisibility({ projectId: project.id }),
          BingService.getCrawlIssues({ projectId: project.id }),
        ]);

        const visibility =
          visibilityResult.status === "fulfilled"
            ? summarizeBingValue(visibilityResult.value.visibility)
            : null;
        const visibilityError =
          visibilityResult.status === "rejected"
            ? describeBingTelemetryError(visibilityResult.reason)
            : null;
        const crawlIssues =
          crawlIssuesResult.status === "fulfilled"
            ? crawlIssuesResult.value.issues
                .slice(0, WAR_ROOM_BING_ISSUE_LIMIT)
                .map(summarizeBingIssue)
            : [];
        const crawlIssueCount =
          crawlIssuesResult.status === "fulfilled"
            ? crawlIssuesResult.value.issues.length
            : null;
        const crawlIssuesError =
          crawlIssuesResult.status === "rejected"
            ? describeBingTelemetryError(crawlIssuesResult.reason)
            : null;

        return {
          projectId: project.id,
          projectName: project.name,
          domain: project.domain,
          connected: true as const,
          siteUrl: connection.siteUrl,
          connectedAccountEmail: connection.connectedAccountEmail,
          connectedAt: connection.createdAt,
          updatedAt: connection.updatedAt,
          visibilitySummary: visibility,
          visibilityError,
          crawlIssues,
          crawlIssueCount,
          crawlIssuesError,
        };
      }),
    );

    return {
      fetchedAt: new Date().toISOString(),
      projects: telemetryProjects,
      connectedProjects: telemetryProjects.filter(
        (project) => project.connected,
      ).length,
    };
  });
