import {
  normalizeObjectSchema,
  safeParseAsync,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  env: {},
}));

// A class instance reproduces what the DataForSEO SDK hands the tools: an
// object whose prototype is not Object.prototype (e.g.
// DataforseoLabsSerpCompetitorsLiveItem). Zod 4's z.record() rejects those
// ("expected record, received <ClassName>"), so a record-based output schema
// makes the MCP server fail these passthrough tools with a -32602 output
// validation error even though the API call succeeded.
class ProviderRow {
  constructor(
    public domain: string,
    public rank_absolute: number,
  ) {}
}

describe("DataForSEO research tool output schemas", () => {
  // Every tool that streams provider rows straight to structuredContent.
  it.each([
    ["find_serp_competitors", "competitors"],
    ["get_local_serp_results", "results"],
    ["search_local_businesses", "businesses"],
    ["get_google_business_questions", "questions"],
    ["get_ranked_keywords", "keywords"],
  ])(
    "%s accepts typed (non-plain-object) provider rows",
    async (toolName, field) => {
      const tools = await import("./dataforseo-research-tools");
      const tool = Object.values(tools).find((t) => t.name === toolName);
      if (!tool) throw new Error(`tool ${toolName} not found`);

      const schema = normalizeObjectSchema(tool.config.outputSchema);
      if (!schema) throw new Error("output schema did not normalize");

      // Mirror the MCP server: validate structuredContent against the tool's
      // own output schema. Extra keys (e.g. get_ranked_keywords' totalCount)
      // are allowed by the passthrough schemas, so one payload covers all.
      const result = await safeParseAsync(schema, {
        [field]: [new ProviderRow("example.com", 1)],
        totalCount: 1,
      });

      expect(result.success).toBe(true);
    },
  );
});
