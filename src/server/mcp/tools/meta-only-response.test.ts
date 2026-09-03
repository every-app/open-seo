import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { identity, sortBy } from "remeda";
import { describe, expect, it, vi } from "vitest";
import { objectSchema } from "@/server/mcp/output-schemas";

vi.mock("cloudflare:workers", () => ({
  env: {},
  DurableObject: class {
    readonly ctx = null;
  },
}));

import * as addRankTrackingKeywords from "./add-rank-tracking-keywords";
import * as createProject from "./create-project";
import * as createRankTracker from "./create-rank-tracker";
import * as dataforseoResearchTools from "./dataforseo-research-tools";
import * as estimateRankTrackerCost from "./estimate-rank-tracker-cost";
import * as getBacklinksOverview from "./get-backlinks-overview";
import * as getBacklinksProfile from "./get-backlinks-profile";
import * as getDomainKeywordSuggestions from "./get-domain-keyword-suggestions";
import * as getDomainOverview from "./get-domain-overview";
import * as getRankTracker from "./get-rank-tracker";
import * as getSerpResults from "./get-serp-results";
import * as googleAnalyticsTools from "./google-analytics-tools";
import * as listProjects from "./list-projects";
import * as listSavedKeywords from "./list-saved-keywords";
import * as localSeoTools from "./local-seo-tools";
import * as projectContext from "./project-context";
import * as removeRankTrackingKeywords from "./remove-rank-tracking-keywords";
import * as researchKeywords from "./research-keywords";
import * as runRankTracker from "./run-rank-tracker";
import * as saveKeywords from "./save-keywords";
import * as searchConsoleTools from "./search-console-tools";
import * as siteAuditTools from "./site-audit-tools";
import * as whoami from "./whoami";

const toolExports: Record<string, unknown> = {
  ...addRankTrackingKeywords,
  ...createProject,
  ...createRankTracker,
  ...dataforseoResearchTools,
  ...estimateRankTrackerCost,
  ...getBacklinksOverview,
  ...getBacklinksProfile,
  ...getDomainKeywordSuggestions,
  ...getDomainOverview,
  ...getRankTracker,
  ...getSerpResults,
  ...googleAnalyticsTools,
  ...listProjects,
  ...listSavedKeywords,
  ...localSeoTools,
  ...projectContext,
  ...removeRankTrackingKeywords,
  ...researchKeywords,
  ...runRankTracker,
  ...saveKeywords,
  ...searchConsoleTools,
  ...siteAuditTools,
  ...whoami,
};

type ToolDefinition = {
  name: string;
  config: { outputSchema?: Parameters<typeof objectSchema>[0] };
};

function isToolDefinition(value: unknown): value is ToolDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "config" in value
  );
}

const TOOLS_DIR = join(import.meta.dirname, ".");

/** Every `export const <name>Tool = {` in a tools file, with the character
 *  offset where that tool's source begins. */
function toolSpans(source: string): { exportName: string; start: number }[] {
  const spans: { exportName: string; start: number }[] = [];
  const pattern = /export const (\w+Tool)\s*=/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    spans.push({ exportName: match[1], start: match.index });
  }
  return spans;
}

/** Offsets of `mcpResponse({...})` calls whose argument object has no
 *  top-level `structuredContent` key. Brace matching keeps a nested mention
 *  from masking a missing one. */
function metaOnlyResponseOffsets(source: string): number[] {
  const offsets: number[] = [];
  let index = source.indexOf("mcpResponse(");
  while (index !== -1) {
    let depth = 0;
    let cursor = index + "mcpResponse".length;
    const argStart = cursor;
    for (; cursor < source.length; cursor++) {
      const char = source[cursor];
      if (char === "(" || char === "{" || char === "[") depth++;
      else if (char === ")" || char === "}" || char === "]") {
        depth--;
        if (depth === 0) break;
      }
    }
    const args = source.slice(argStart, cursor + 1);
    let argDepth = 0;
    let hasStructuredContent = false;
    for (let i = 0; i < args.length; i++) {
      const char = args[i];
      if (char === "(" || char === "{" || char === "[") argDepth++;
      else if (char === ")" || char === "}" || char === "]") argDepth--;
      // depth 2 == a key directly on the argument object literal
      else if (argDepth === 2 && args.startsWith("structuredContent", i)) {
        hasStructuredContent = true;
      }
    }
    if (!hasStructuredContent) offsets.push(index);
    index = source.indexOf("mcpResponse(", cursor + 1);
  }
  return offsets;
}

/** Tool exports that answer with meta but no structuredContent somewhere in
 *  their handler. */
function toolsReturningMetaOnly(): string[] {
  const names = new Set<string>();
  const files = readdirSync(TOOLS_DIR).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );
  for (const file of files) {
    const source = readFileSync(join(TOOLS_DIR, file), "utf8");
    const spans = toolSpans(source);
    for (const offset of metaOnlyResponseOffsets(source)) {
      const owner = spans.filter((span) => span.start < offset).at(-1);
      if (owner) names.add(owner.exportName);
    }
  }
  return sortBy([...names], identity());
}

/**
 * mcpResponse turns a response carrying `meta` but no `structuredContent` into
 * `{ meta }`, and the MCP SDK validates that against the tool's output schema
 * and converts a mismatch into a client-visible -32602 — after the handler has
 * already done the work. run_site_audit's capacity refusal hit exactly this in
 * production. So any tool that can answer with meta alone must declare an
 * output schema that accepts a meta-only payload.
 *
 * Asserting the reverse (that *every* tool tolerates a meta-only payload) would
 * be wrong: 43 of the 46 tools legitimately require output fields they always
 * populate, and loosening those would forfeit real validation.
 */
describe("tools that answer with meta but no structured content", () => {
  it("declare an output schema that accepts a meta-only response", async () => {
    const owners = toolsReturningMetaOnly();
    expect(owners.length).toBeGreaterThan(0);

    for (const exportName of owners) {
      const tool = toolExports[exportName];
      if (!isToolDefinition(tool)) {
        throw new Error(`${exportName} is not an exported tool definition`);
      }
      const { name, config } = tool;
      if (!config.outputSchema) continue;

      const result = await objectSchema(config.outputSchema).safeParseAsync({
        meta: { organizationId: "org_123", projectId: "project_123" },
      });

      expect(result.success, `${name} rejects a meta-only response`).toBe(true);
    }
  });
});
