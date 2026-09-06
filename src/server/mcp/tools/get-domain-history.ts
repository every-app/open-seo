import { z } from "zod";
import { DomainService } from "@/server/features/domain/services/DomainService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { resolveLabsMarket } from "@/shared/keyword-locations";
import {
  assertLabsLocationCode,
  assertLanguageForLocation,
} from "@/server/lib/market";
import {
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";
import { domainField } from "@/types/schemas/domain";
import {
  DOMAIN_HISTORY_MAX_DOMAINS,
  DOMAIN_HISTORY_MIN_DATE,
  estimateDomainHistoryCostUsd,
} from "@/shared/domain-history";
import { AppError } from "@/server/lib/errors";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const inputSchema = {
  projectId: projectIdSchema,
  domains: z
    .array(domainField)
    .min(1)
    .max(DOMAIN_HISTORY_MAX_DOMAINS)
    .transform((domains) => [...new Set(domains)])
    .describe("Domains to compare. Each domain is one billed task."),
  dateFrom: isoDateSchema.describe(
    `First month to return. Data starts at ${DOMAIN_HISTORY_MIN_DATE}.`,
  ),
  dateTo: isoDateSchema.describe("Last month to return."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

const pointSchema = z.object({
  date: z.string(),
  organicTraffic: z.number().nullable(),
  organicKeywords: z.number().nullable(),
});

export const getDomainHistoryTool = {
  name: "get_domain_history",
  config: {
    title: "Compare historical domain traffic",
    description:
      "Returns monthly estimated organic traffic and ranking-keyword history for up to five domains. DataForSEO history starts in October 2020 and is updated weekly. These are modeled estimates, not Search Console measurements. Charges about $0.12 per domain plus $0.0012 per returned month; cached for 12 hours.",
    inputSchema,
    outputSchema: z
      .object({
        dateFrom: z.string(),
        dateTo: z.string(),
        locationCode: z.number(),
        languageCode: z.string(),
        estimatedMaxCostUsd: z.number(),
        series: z.array(
          z.object({
            domain: z.string(),
            points: z.array(pointSchema),
            fetchedAt: z.string(),
          }),
        ),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    if (args.dateFrom < DOMAIN_HISTORY_MIN_DATE) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Historical data starts at ${DOMAIN_HISTORY_MIN_DATE}`,
      );
    }
    if (args.dateFrom > args.dateTo) {
      throw new AppError("VALIDATION_ERROR", "dateFrom must be before dateTo");
    }

    const { locationCode, languageCode } = resolveLabsMarket(
      args,
      context.project,
    );
    assertLabsLocationCode(locationCode);
    assertLanguageForLocation(locationCode, languageCode);
    const result = await DomainService.getHistoricalOverview(
      {
        projectId: args.projectId,
        domains: args.domains,
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        locationCode,
        languageCode,
      },
      context.billing,
    );
    const estimatedMaxCostUsd = estimateDomainHistoryCostUsd(
      args.domains.length,
      args.dateFrom,
      args.dateTo,
    );
    const summary = result.series.map((item) => {
      const first = item.points[0];
      const last = item.points.at(-1);
      return `${item.domain}: ${first?.organicTraffic ?? "?"} (${first?.date ?? "no data"}) -> ${last?.organicTraffic ?? "?"} (${last?.date ?? "no data"})`;
    });

    return mcpResponse({
      text: [
        `Historical organic traffic estimates for ${args.dateFrom} to ${args.dateTo}:`,
        ...summary,
        `Estimated maximum provider cost: $${estimatedMaxCostUsd.toFixed(4)} (cached repeats may cost less).`,
      ].join("\n"),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/domain`,
        { domain: args.domains[0] },
      ),
      structuredContent: {
        ...result,
        estimatedMaxCostUsd,
      },
    });
  }),
};
