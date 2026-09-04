import { z } from "zod";
import { FirstPartySignalsService } from "@/server/features/first-party-signals/FirstPartySignalsService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { formatMcpTable } from "@/server/mcp/table";
import {
  firstPartyConversionRatesSchema,
  firstPartyFunnelTotalsSchema,
} from "@/shared/first-party-signals";

const date = z.string().date();
const periodSchema = z.object({
  startDate: date,
  endDate: date,
  timezone: z.literal("UTC"),
});
const commonInput = {
  projectId: projectIdSchema,
  startDate: date.describe("Inclusive UTC date in YYYY-MM-DD format."),
  endDate: date.describe("Inclusive UTC date in YYYY-MM-DD format."),
} as const;

const funnelOutputSchema = z
  .object({
    status: z.enum(["ok", "no_data"]),
    period: periodSchema,
    observedAt: z.string().nullable(),
    receivedAt: z.string().nullable(),
    totals: firstPartyFunnelTotalsSchema.nullable(),
    conversion: firstPartyConversionRatesSchema.nullable(),
    privacy: z.string(),
  })
  .passthrough();

type FunnelArgs = z.infer<z.ZodObject<typeof commonInput>>;

export const getFirstPartyFunnelTool = {
  name: "get_first_party_funnel",
  config: {
    title: "Get first-party business funnel",
    description:
      "Read privacy-safe daily aggregate counts for searches, registrations, checkout, and completed payments. No users, sessions, identifiers, search terms, or amounts are stored.",
    inputSchema: commonInput,
    outputSchema: funnelOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: FunnelArgs, context) => {
    const result = await FirstPartySignalsService.getFunnel(args);
    const totals = result.totals;
    const text = totals
      ? `First-party funnel (${args.startDate} to ${args.endDate}): searches ${totals.searchStarted}, completed ${totals.searchCompleted}, no result ${totals.searchNoResults}, registrations ${totals.registrationsCompleted}, checkout ${totals.checkoutStarted}, payments ${totals.paymentsCompleted}.`
      : "No first-party aggregate snapshots were received for this period.";
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/settings/integrations`,
      ),
      structuredContent: result,
    });
  }),
};

const landingInput = {
  ...commonInput,
  limit: z.number().int().min(1).max(250).default(50),
} as const;
type LandingArgs = z.infer<z.ZodObject<typeof landingInput>>;
const landingOutputSchema = z
  .object({
    status: z.enum(["ok", "no_data"]),
    period: periodSchema,
    rows: z.array(
      firstPartyFunnelTotalsSchema.extend({
        landingPath: z.string(),
        conversion: firstPartyConversionRatesSchema,
      }),
    ),
    privacy: z.string(),
  })
  .passthrough();

export const getFirstPartyLandingConversionsTool = {
  name: "get_first_party_landing_conversions",
  config: {
    title: "Get first-party landing conversions",
    description:
      "Compare privacy-safe funnel counts by explicitly allowlisted public landing pathname. Query strings and identifiers are never accepted.",
    inputSchema: landingInput,
    outputSchema: landingOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: LandingArgs, context) => {
    const result = await FirstPartySignalsService.getLandingConversions(args);
    const text = result.rows.length
      ? `First-party landing conversions (${result.rows.length}):\n${formatMcpTable(
          result.rows,
          [
            { header: "landing", value: (row) => row.landingPath },
            { header: "searches", value: (row) => row.searchStarted },
            { header: "checkout", value: (row) => row.checkoutStarted },
            { header: "payments", value: (row) => row.paymentsCompleted },
          ],
        )}`
      : "No first-party landing aggregate snapshots were received for this period.";
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/settings/integrations`,
      ),
      structuredContent: result,
    });
  }),
};
