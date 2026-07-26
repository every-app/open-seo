import { z } from "zod";

import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";

const VERCEL_API_BASE = "https://api.vercel.com";

/** A Vercel API call returned a non-2xx status. 401/403 mean the token was
 *  revoked or lacks access — surfaced as a reconnect prompt, like Bing's
 *  expected grant failures. */
export class VercelApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "VercelApiError";
  }
}

export function isExpectedVercelFailure(error: unknown): boolean {
  return (
    error instanceof VercelApiError &&
    (error.status === 401 || error.status === 403)
  );
}

/** Whether the instance-level VERCEL_TOKEN secret is configured. Drives the
 *  setup-card-vs-picker UI; mirrors hasSelfHostedBingConfig. */
export async function hasVercelToken(): Promise<boolean> {
  return Boolean(await getOptionalEnvValue("VERCEL_TOKEN"));
}

type VercelProject = {
  id: string;
  name: string;
};

/** One row from visits/aggregate. `key` is the grouped dimension value —
 *  a timestamp for by=day, a hostname for by=referrerHostname ("" = direct,
 *  "Others" = Vercel's literal tail bucket), a path for by=requestPath. */
type VercelAggregateRow = {
  key: string;
  visitors: number;
  pageviews: number;
};

type VercelTotals = { visitors: number; pageviews: number };

/** One row from events/aggregate — custom events sent with track(). */
type VercelEventRow = {
  key: string;
  visitors: number;
  count: number;
};

const projectsResponseSchema = z.looseObject({
  projects: z.array(z.looseObject({ id: z.string(), name: z.string() })),
});

const countResponseSchema = z.looseObject({
  data: z.looseObject({ visitors: z.number(), pageviews: z.number() }),
});

const aggregateRowSchema = z.looseObject({
  visitors: z.number(),
  pageviews: z.number(),
});

const eventRowSchema = z.looseObject({
  visitors: z.number(),
  count: z.number(),
});

const aggregateResponseSchema = z.looseObject({
  data: z.array(z.record(z.string(), z.unknown())),
});

function messageForStatus(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "Vercel rejected the access token (revoked, expired, or missing Web Analytics access). Update VERCEL_TOKEN to continue.";
  }
  if (status === 429) {
    return "Vercel API rate limit reached. Retry shortly.";
  }
  if (status === 404) {
    return "Vercel project not found. It may have been deleted or moved to another team.";
  }
  return `Vercel API error (${status}): ${body.slice(0, 300)}`;
}

/** Read-only Vercel Web Analytics client. Auth is the instance-level
 *  VERCEL_TOKEN secret (like DATAFORSEO_API_KEY) — there is no per-user
 *  grant. Endpoint shapes verified live 2026-07-26; see specs/0010. */
function analyticsQuery(
  dataset: "visits" | "events",
  endpoint: "count" | "aggregate",
  opts: {
    vercelProjectId: string;
    vercelTeamId: string | null;
    since?: string;
    until?: string;
    by?: string;
    limit?: number;
    filter?: string;
  },
): string {
  const params = new URLSearchParams({ projectId: opts.vercelProjectId });
  if (opts.vercelTeamId) params.set("teamId", opts.vercelTeamId);
  if (opts.since) params.set("since", opts.since);
  if (opts.until) params.set("until", opts.until);
  if (opts.by) params.set("by", opts.by);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.filter) params.set("filter", opts.filter);
  return `/v1/query/web-analytics/${dataset}/${endpoint}?${params}`;
}

/** Escape a string for use inside an OData single-quoted literal. */
function odataString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function createVercelAnalyticsClient() {
  async function request(path: string): Promise<unknown> {
    const token = await getRequiredEnvValue("VERCEL_TOKEN");
    const response = await fetch(`${VERCEL_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new VercelApiError(
        response.status,
        messageForStatus(response.status, body),
        body,
      );
    }
    return response.json();
  }

  return {
    /** List projects visible to the token. Vercel scopes project listings:
     *  team projects only appear with an explicit teamId (verified live —
     *  the personal scope returned zero projects for a team-only account),
     *  so this fans out across the token's teams plus the personal scope. */
    async listProjects(): Promise<
      Array<VercelProject & { teamId: string | null; teamSlug: string | null }>
    > {
      const teamsRaw = await request("/v2/teams");
      const teams = z
        .looseObject({
          teams: z.array(
            z.looseObject({ id: z.string(), slug: z.string().nullish() }),
          ),
        })
        .parse(teamsRaw).teams;

      const scopes: Array<{ teamId: string | null; teamSlug: string | null }> =
        [
          { teamId: null, teamSlug: null },
          ...teams.map((team) => ({
            teamId: team.id,
            teamSlug: team.slug ?? null,
          })),
        ];
      const results = await Promise.all(
        scopes.map(async (scope) => {
          const query = scope.teamId
            ? `?limit=100&teamId=${scope.teamId}`
            : "?limit=100";
          const raw = await request(`/v9/projects${query}`);
          return projectsResponseSchema
            .parse(raw)
            .projects.map((project) => ({ ...project, ...scope }));
        }),
      );
      return results.flat();
    },

    /** Total visitors/pageviews matching the window (whole reporting window
     *  when no dates are given). */
    async getVisitTotals(opts: {
      vercelProjectId: string;
      vercelTeamId: string | null;
      since?: string;
      until?: string;
    }): Promise<VercelTotals> {
      const raw = await request(analyticsQuery("visits", "count", opts));
      return countResponseSchema.parse(raw).data;
    },

    /** Aggregate rows grouped by one dimension. For by=day the key is the
     *  row's `timestamp`; otherwise it's the dimension's value. */
    async getVisitAggregate(opts: {
      vercelProjectId: string;
      vercelTeamId: string | null;
      since: string;
      until: string;
      by: string;
      limit?: number;
    }): Promise<VercelAggregateRow[]> {
      const raw = await request(analyticsQuery("visits", "aggregate", opts));
      const rows = aggregateResponseSchema.parse(raw).data;
      return rows.map((row) => {
        const metrics = aggregateRowSchema.parse(row);
        const rawKey = opts.by === "day" ? row["timestamp"] : row[opts.by];
        return {
          key: typeof rawKey === "string" ? rawKey : "",
          visitors: metrics.visitors,
          pageviews: metrics.pageviews,
        };
      });
    },

    /** Custom-event rows grouped by one dimension (usually eventName, or
     *  day when narrowed to one event). Event rows carry `count`, not
     *  `pageviews` — a sibling shape to visits, verified live 2026-07-26. */
    async getEventAggregate(opts: {
      vercelProjectId: string;
      vercelTeamId: string | null;
      since: string;
      until: string;
      by: string;
      limit?: number;
      /** Narrow to one event; escaped into an OData eventName filter. */
      eventName?: string;
    }): Promise<VercelEventRow[]> {
      const { eventName, ...rest } = opts;
      const raw = await request(
        analyticsQuery("events", "aggregate", {
          ...rest,
          ...(eventName
            ? { filter: `eventName eq ${odataString(eventName)}` }
            : {}),
        }),
      );
      const rows = aggregateResponseSchema.parse(raw).data;
      return rows.map((row) => {
        const metrics = eventRowSchema.parse(row);
        const rawKey = opts.by === "day" ? row["timestamp"] : row[opts.by];
        return {
          key: typeof rawKey === "string" ? rawKey : "",
          visitors: metrics.visitors,
          count: metrics.count,
        };
      });
    },
  };
}

export type { VercelAggregateRow, VercelEventRow, VercelTotals };
