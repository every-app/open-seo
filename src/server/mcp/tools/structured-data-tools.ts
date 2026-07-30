import { z } from "zod";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  StructuredDataService,
  type StructuredDataFailureReason,
} from "@/server/features/structured-data/services/StructuredDataService";
import { RICH_RESULT_RULES } from "@/server/lib/structured-data/google-rules";
import type { ValidationResult } from "@/server/lib/structured-data/types";

/** Findings named in the text summary before it trails off. The full list is
 *  always in structuredContent. */
const SUMMARY_FINDINGS = 25;

/** One message per failure mode the service can report. */
const FAILURE_TEXT: Record<
  StructuredDataFailureReason,
  (source?: string) => string
> = {
  no_input: () =>
    "Pass either `markup` (JSON-LD or HTML to validate) or `url` (a page to fetch and validate).",
  ambiguous_input: () =>
    "Pass `markup` or `url`, not both — validating a snippet and a live page are different questions.",
  fetch_failed: (source) =>
    `Could not read ${source ?? "that URL"}. It may be unreachable, blocking crawlers, oversized, or not a public address.`,
};

const COVERED_FEATURES = RICH_RESULT_RULES.map((rule) => rule.feature).join(
  ", ",
);

/**
 * Types present in the markup that this validator holds no Google rules for.
 *
 * Reported in both the summary and structuredContent, because omission is not
 * a statement: a caller comparing `types` against `features` sees a type
 * missing and cannot tell whether Google has no feature for it or whether we
 * simply have not implemented the check. Several uncovered types
 * (SoftwareApplication among them) do have Google features.
 */
function notCheckedTypes(result: ValidationResult): string[] {
  const ruled = new Set(
    result.features.flatMap((feature) => [feature.feature, feature.type]),
  );
  return result.types.filter((type) => !ruled.has(type));
}

function summarize(result: ValidationResult, source: string): string {
  if (result.scriptCount === 0) {
    return `${source}: no JSON-LD found. Nothing to validate — this page has no application/ld+json block.`;
  }

  const header =
    `${source}: ${result.scriptCount} JSON-LD block${result.scriptCount === 1 ? "" : "s"}, ` +
    `${result.nodeCount} entit${result.nodeCount === 1 ? "y" : "ies"} — ` +
    `${result.errorCount} error${result.errorCount === 1 ? "" : "s"}, ` +
    `${result.warningCount} warning${result.warningCount === 1 ? "" : "s"} ` +
    `(Schema.org ${result.schemaVersion})`;

  const lines = [header];
  if (result.types.length > 0) {
    lines.push(`types: ${result.types.join(", ")}`);
  }

  for (const feature of result.features) {
    const verdict = feature.eligible
      ? "meets Google's required properties"
      : `missing required: ${feature.missingRequired.join(", ")}`;
    lines.push(`${feature.feature} — ${verdict} (${feature.docsUrl})`);
  }

  const unruled = notCheckedTypes(result);
  if (unruled.length > 0) {
    lines.push(
      `not checked — recognised, but Google feature validation is not implemented here: ${unruled.join(", ")}. This is not a pass. Validated features: ${COVERED_FEATURES}`,
    );
  }

  const ordered = result.findings.toSorted((a, b) => {
    const rank = { error: 0, warning: 1, info: 2 };
    return rank[a.severity] - rank[b.severity];
  });
  for (const finding of ordered.slice(0, SUMMARY_FINDINGS)) {
    const where = finding.path === "" ? "root" : finding.path;
    const block =
      result.scriptCount > 1 ? `block ${finding.scriptIndex + 1} ` : "";
    lines.push(
      `  ${finding.severity.toUpperCase()} ${block}${where} [${finding.code}] ${finding.message}`,
    );
  }
  if (ordered.length > SUMMARY_FINDINGS) {
    lines.push(
      `  …and ${ordered.length - SUMMARY_FINDINGS} more (full list in structuredContent)`,
    );
  }

  if (result.errorCount === 0 && result.warningCount === 0) {
    lines.push("No problems found.");
  }
  lines.push(
    "Advisory only: this checks Schema.org validity and Google's documented requirements. For a live page, Search Console's own verdict (inspect_urls) is authoritative.",
  );
  return lines.join("\n");
}

const structuredDataInputSchema = {
  projectId: projectIdSchema,
  markup: z
    .string()
    .min(1)
    .optional()
    .describe(
      "JSON-LD to validate — either a bare snippet ({…} or […]) or a whole HTML document. Use this for markup that is not published yet.",
    ),
  url: z
    .string()
    .url()
    .optional()
    .describe(
      "A public URL to fetch and validate instead of passing markup. Reads the HTML as served, so client-rendered JSON-LD will not be seen.",
    ),
} as const;

type StructuredDataArgs = z.infer<
  z.ZodObject<typeof structuredDataInputSchema>
>;

export const validateStructuredDataTool = {
  name: "validate_structured_data",
  config: {
    title: "Validate structured data",
    description:
      "Validate JSON-LD structured data against the Schema.org vocabulary and Google's documented rich-result requirements. Pass `markup` (a snippet or a full HTML document) to check markup before publishing it, or `url` to check a live page as served. Reports unparseable JSON, types and properties that do not exist, values in the wrong format or outside their declared range, missing required properties per Google feature, and features Google has retired. Covers " +
      COVERED_FEATURES +
      ". Advisory: for a page Google has already crawled, inspect_urls returns Google's own verdict, which is authoritative. Runs locally — no network call unless `url` is given, and no credits either way.",
    inputSchema: structuredDataInputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      source: z.string().optional(),
      schemaVersion: z.string().optional(),
      scriptCount: z.number().optional(),
      nodeCount: z.number().optional(),
      errorCount: z.number().optional(),
      warningCount: z.number().optional(),
      types: z.array(z.string()).optional(),
      features: z.array(looseObjectOutputSchema).optional(),
      /** Types recognised but not validated against any Google feature.
       *  Present so absence from `features` is never read as a pass. */
      notChecked: z.array(z.string()).optional(),
      findings: z.array(looseObjectOutputSchema).optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      // Fetches the page when `url` is used.
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: StructuredDataArgs, context) => {
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}`,
    );

    const validation = await StructuredDataService.validate({
      markup: args.markup,
      url: args.url,
    });

    if (!validation.ok) {
      return mcpResponse({
        text: FAILURE_TEXT[validation.reason](validation.source),
        meta,
        structuredContent: {
          ok: false,
          reason: validation.reason,
          ...(validation.source ? { source: validation.source } : {}),
        },
      });
    }

    const { result, source } = validation;
    return mcpResponse({
      text: summarize(result, source),
      meta,
      structuredContent: {
        ok: true,
        source,
        schemaVersion: result.schemaVersion,
        scriptCount: result.scriptCount,
        nodeCount: result.nodeCount,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        types: result.types,
        features: result.features,
        notChecked: notCheckedTypes(result),
        findings: result.findings,
      },
    });
  }),
};
