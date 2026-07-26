import { AppError } from "@/server/lib/errors";
import {
  createVercelAnalyticsClient,
  type VercelAggregateRow,
  type VercelTotals,
} from "@/server/lib/vercelAnalytics";
import {
  VercelConnectionRepository,
  type VercelConnection,
} from "@/server/features/vercel/repositories/VercelConnectionRepository";

/** Thrown when a project has no connected Vercel project. */
export class VercelNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("Vercel Web Analytics is not connected for this project");
    this.name = "VercelNotConnectedError";
  }
}

const WINDOW_DAYS = 30;

type TrafficRange = { since: string; until: string };

type VercelTrafficReport = {
  vercelProjectName: string;
  range: TrafficRange;
  prevRange: TrafficRange;
  totals: VercelTotals;
  prevTotals: VercelTotals;
  daily: VercelAggregateRow[];
  referrers: VercelAggregateRow[];
  pages: VercelAggregateRow[];
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Current = the last 30 whole days up to tomorrow (so today is included);
 *  previous = the 30 days immediately before. Unlike the search APIs this
 *  one takes real date ranges, so the comparison is exact. */
export function trafficRanges(now: Date): {
  range: TrafficRange;
  prevRange: TrafficRange;
} {
  const day = 24 * 60 * 60 * 1000;
  const until = new Date(now.getTime() + day);
  const since = new Date(now.getTime() - (WINDOW_DAYS - 1) * day);
  const prevUntil = since;
  const prevSince = new Date(since.getTime() - WINDOW_DAYS * day);
  return {
    range: { since: isoDay(since), until: isoDay(until) },
    prevRange: { since: isoDay(prevSince), until: isoDay(prevUntil) },
  };
}

async function getConnection(
  projectId: string,
): Promise<VercelConnection | null> {
  return VercelConnectionRepository.getByProjectId(projectId);
}

/** Vercel projects the instance token can see, flagged with the currently
 *  selected one. */
async function listProjectsForPicker(projectId: string) {
  const [connection, projects] = await Promise.all([
    VercelConnectionRepository.getByProjectId(projectId),
    createVercelAnalyticsClient().listProjects(),
  ]);
  return projects.map((project) => ({
    vercelProjectId: project.id,
    name: project.name,
    teamId: project.teamId,
    teamSlug: project.teamSlug,
    isSelected: connection?.vercelProjectId === project.id,
  }));
}

/** Map a Vercel project to an OpenSEO project. Validates the id against the
 *  token's visible projects so a typo can't create a dead connection. */
async function setProject(input: {
  projectId: string;
  organizationId: string;
  vercelProjectId: string;
  userId: string;
}): Promise<VercelConnection> {
  const projects = await createVercelAnalyticsClient().listProjects();
  const match = projects.find(
    (project) => project.id === input.vercelProjectId,
  );
  if (!match) {
    throw new AppError(
      "NOT_FOUND",
      "That Vercel project isn't visible to this deployment's VERCEL_TOKEN.",
    );
  }
  return VercelConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    vercelProjectId: match.id,
    vercelTeamId: match.teamId,
    vercelProjectName: match.name,
    connectedByUserId: input.userId,
  });
}

async function disconnect(projectId: string): Promise<void> {
  await VercelConnectionRepository.deleteByProjectId(projectId);
}

/** The Traffic page payload: 30-day totals with an exact prior-period
 *  comparison, the daily series, top referrers, and top pages. */
async function getTraffic(input: {
  projectId: string;
}): Promise<VercelTrafficReport> {
  const connection = await VercelConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new VercelNotConnectedError(input.projectId);
  }
  const client = createVercelAnalyticsClient();
  const target = {
    vercelProjectId: connection.vercelProjectId,
    vercelTeamId: connection.vercelTeamId,
  };
  const { range, prevRange } = trafficRanges(new Date());
  const [totals, prevTotals, daily, referrers, pages] = await Promise.all([
    client.getVisitTotals({ ...target, ...range }),
    client.getVisitTotals({ ...target, ...prevRange }),
    client.getVisitAggregate({ ...target, ...range, by: "day" }),
    client.getVisitAggregate({
      ...target,
      ...range,
      by: "referrerHostname",
      limit: 25,
    }),
    client.getVisitAggregate({
      ...target,
      ...range,
      by: "requestPath",
      limit: 50,
    }),
  ]);
  return {
    vercelProjectName: connection.vercelProjectName,
    range,
    prevRange,
    totals,
    prevTotals,
    daily,
    referrers,
    pages,
  };
}

export const VercelAnalyticsService = {
  getConnection,
  listProjectsForPicker,
  setProject,
  disconnect,
  getTraffic,
};
