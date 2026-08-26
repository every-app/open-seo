import { z } from "zod";
import { PaaMiningService } from "@/server/features/paa-mining/services/PaaMiningService";
import { PAA_MINING_REGIONS } from "@/shared/paa-mining";
import { isSerperConfigured } from "@/server/lib/serper/client";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

/**
 * PAA + Social Mining scans via the operator's Serper.dev account
 * (BYO SERPER_API_KEY, same model as DataForSEO). Both tools no-op with a
 * clear message when the key is absent.
 */

const NOT_CONFIGURED_TEXT =
  "Serper.dev is not connected. Set SERPER_API_KEY (get a key at https://serper.dev) and restart to enable PAA + Social Mining.";

const MODULE_DISABLED_TEXT =
  "The PAA + Social Mining module is turned off in this OpenSEO install. An operator can re-enable it under Settings > Features.";

function paaMiningPath(projectId: string) {
  return `/p/${projectId}/paa-mining`;
}

/** Disabled module wins over everything; missing key is the second gate. */
async function unavailableText(): Promise<string | null> {
  if (!(await PaaMiningService.isModuleEnabled())) {
    return MODULE_DISABLED_TEXT;
  }
  if (!(await isSerperConfigured())) return NOT_CONFIGURED_TEXT;
  return null;
}

// ─── run_paa_mining ──────────────────────────────────────────────────────────

const runInputSchema = {
  projectId: projectIdSchema,
  seed: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .describe("The seed keyword to mine People Also Ask questions for."),
  region: z
    .enum(PAA_MINING_REGIONS)
    .optional()
    .describe("Google SERP region (default US)."),
} as const;

type RunArgs = z.infer<z.ZodObject<typeof runInputSchema>>;

export const runPaaMiningTool = {
  name: "run_paa_mining",
  config: {
    title: "Run PAA + social mining scan",
    description:
      "Mine People Also Ask questions for a seed keyword and the Reddit/Quora threads answering them, to surface demand-discovery language that keyword tools miss. Returns a report with questions clustered by intent, social threads per question, and extracted phrases/pain points. Uses Serper.dev search credits.",
    inputSchema: runInputSchema,
    outputSchema: z
      .object({
        scanId: z.string(),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: RunArgs, context) => {
    const unavailable = await unavailableText();
    if (unavailable !== null) {
      return mcpResponse({
        text: unavailable,
        meta: buildProjectMeta(
          context,
          args.projectId,
          paaMiningPath(args.projectId),
        ),
      });
    }
    const { scanId, report } = await PaaMiningService.runScan({
      projectId: args.projectId,
      seed: args.seed,
      region: args.region,
    });
    return mcpResponse({
      text: `PAA + social mining complete for "${args.seed}" (${report.questions.length} questions, ${report.demandSignals.length} demand-signal groups). Use get_paa_scan with scanId ${scanId} to retrieve the full report.`,
      structuredContent: { scanId },
      meta: buildProjectMeta(
        context,
        args.projectId,
        paaMiningPath(args.projectId),
      ),
    });
  }),
};

// ─── get_paa_scan ─────────────────────────────────────────────────────────────

const getInputSchema = {
  projectId: projectIdSchema,
  scanId: z.string().min(1).max(128).describe("Scan ID from run_paa_mining."),
} as const;

type GetArgs = z.infer<z.ZodObject<typeof getInputSchema>>;

export const getPaaScanTool = {
  name: "get_paa_scan",
  config: {
    title: "Get PAA + social mining report",
    description:
      "Retrieve a completed PAA + social mining report by scan ID: the clustered questions, social threads per question, and the demand-discovery phrases/pain points extracted from what people actually say.",
    inputSchema: getInputSchema,
    outputSchema: z
      .object({
        report: looseObjectOutputSchema,
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetArgs, context) => {
    const unavailable = await unavailableText();
    if (unavailable !== null) {
      return mcpResponse({
        text: unavailable,
        meta: buildProjectMeta(
          context,
          args.projectId,
          paaMiningPath(args.projectId),
        ),
      });
    }
    const view = await PaaMiningService.getView(args.projectId, args.scanId);
    if (view.status !== "completed") {
      return mcpResponse({
        text: `Scan ${args.scanId} is not complete (${view.status}).`,
        meta: buildProjectMeta(
          context,
          args.projectId,
          paaMiningPath(args.projectId),
        ),
      });
    }
    return mcpResponse({
      text: `PAA + social mining report for "${view.report.seed}": ${view.report.questions.length} questions across ${view.report.demandSignals.length} intent groups.`,
      structuredContent: { report: view.report },
      meta: buildProjectMeta(
        context,
        args.projectId,
        paaMiningPath(args.projectId),
      ),
    });
  }),
};
