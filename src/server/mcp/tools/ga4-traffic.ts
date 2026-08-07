import { z } from "zod";
import { mcpResponse } from "@/server/mcp/formatters";
import { getGoogleServiceAccountToken } from "@/server/lib/googleServiceAccount";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

// ponytail: gates on "caller owns projectId" via withMcpProjectAuth, not yet
// on "projectId owns propertyId" — the project schema has no ga4PropertyId
// column to check against. Closes the unauthenticated-tool gap; a caller who
// owns *any* project can still pass an arbitrary propertyId. Upgrade path:
// add a per-project GA4 property binding and verify it here once one exists.
interface Ga4Report {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
}

function rows(result: Ga4Report) {
  return (result.rows ?? []).map((row) => ({
    ...(row.dimensionValues?.length
      ? { dimension: row.dimensionValues[0]?.value }
      : {}),
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
    users: Number(row.metricValues?.[1]?.value ?? 0),
    pageviews: Number(row.metricValues?.[2]?.value ?? 0),
  }));
}

const inputSchema = {
  projectId: projectIdSchema,
  propertyId: z.string().regex(/^\d+$/).describe("GA4 numeric property ID."),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Start date (YYYY-MM-DD)."),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("End date (YYYY-MM-DD)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Top-page limit; defaults to 25."),
} as const;
type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const ga4TrafficTool = {
  name: "ga4_traffic",
  config: {
    title: "Get GA4 traffic",
    description:
      "Read Google Analytics 4 sessions, users, pageviews, daily traffic, and top pages for a property and date range.",
    inputSchema,
    outputSchema: z
      .object({
        ok: z.boolean(),
        reason: z.string().optional(),
        propertyId: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        daily: z.array(z.record(z.string(), z.unknown())).optional(),
        topPages: z.array(z.record(z.string(), z.unknown())).optional(),
        totals: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args) => {
    const auth = await getGoogleServiceAccountToken([
      "https://www.googleapis.com/auth/analytics.readonly",
    ]);
    if (!("token" in auth))
      return mcpResponse({
        text: auth.setupMessage,
        structuredContent: {
          ok: false,
          reason: "google_credentials_not_configured",
          setupMessage: auth.setupMessage,
        },
      });
    const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${args.propertyId}:runReport`;
    const run = async (
      dimensions: string[],
      metrics: string[],
      limit?: number,
    ) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: args.startDate, endDate: args.endDate }],
          dimensions: dimensions.map((name) => ({ name })),
          metrics: metrics.map((name) => ({ name })),
          ...(limit ? { limit: String(limit) } : {}),
        }),
      });
      if (!response.ok)
        throw new Error(
          `GA4 API error (${response.status}): ${(await response.text()).slice(0, 300)}`,
        );
      // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- response.json() is Promise<any>; the cast is required
      return (await response.json()) as Ga4Report;
    };
    try {
      const [totals, daily, topPages] = await Promise.all([
        run([], ["sessions", "totalUsers", "screenPageViews"]),
        run(["date"], ["sessions", "totalUsers", "screenPageViews"]),
        run(
          ["pagePath"],
          ["sessions", "totalUsers", "screenPageViews"],
          args.limit ?? 25,
        ),
      ]);
      const total = rows(totals)[0] ?? { sessions: 0, users: 0, pageviews: 0 };
      return mcpResponse({
        text: `GA4 traffic for property ${args.propertyId} (${args.startDate} to ${args.endDate}): ${total.sessions} sessions, ${total.users} users, ${total.pageviews} pageviews.`,
        structuredContent: {
          ok: true,
          propertyId: args.propertyId,
          startDate: args.startDate,
          endDate: args.endDate,
          totals: total,
          daily: rows(daily),
          topPages: rows(topPages),
        },
      });
    } catch (error) {
      return mcpResponse({
        text: error instanceof Error ? error.message : String(error),
        structuredContent: { ok: false, reason: "ga4_api_error" },
      });
    }
  }),
};
