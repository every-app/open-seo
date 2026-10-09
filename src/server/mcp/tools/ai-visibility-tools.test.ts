import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/server";
import { AiVisibilityError } from "@/server/features/ai-visibility/services/aiVisibilityErrors";
import { buildSamMcpTools } from "@/server/features/sam/samChatTools";
import { createOpenSeoMcpServer } from "@/server/mcp/server";
import * as definitions from "./ai-visibility-tools";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  service: {
    getTracker: vi.fn(),
    saveTracker: vi.fn(),
    estimateCost: vi.fn(),
    setSchedule: vi.fn(),
    runCheck: vi.fn(),
    getRun: vi.fn(),
    getResults: vi.fn(),
    getAnswer: vi.fn(),
    getSources: vi.fn(),
    exportData: vi.fn(),
  },
}));
vi.mock("cloudflare:workers", () => ({
  env: {},
  waitUntil: vi.fn(),
  DurableObject: class {
    kind = "mock";
  },
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: { getProjectForOrganization: mocks.authorize },
}));
vi.mock("@/server/features/ai-visibility/services/AiVisibilityService", () => ({
  AiVisibilityService: mocks.service,
}));
const projectId = "00000000-0000-4000-8000-000000000001";
const runId = "00000000-0000-4000-8000-000000000002";
const context = makeToolContext();
const state = {
  configured: false,
  tracker: null,
  topics: [],
  prompts: [],
  brands: [],
  engines: [],
  capabilities: [],
  recentRuns: [],
  providerConfigured: true,
};
const run = {
  id: runId,
  status: "running",
  trigger: "manual",
  expected: 4,
  completed: 1,
  failed: 1,
  pending: 2,
  createdAt: "2026-09-05T00:00:00Z",
  completedAt: null,
  pollAfterSeconds: 30,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ id: projectId, domain: "example.com" });
  mocks.service.getTracker.mockResolvedValue(state);
  mocks.service.getRun.mockResolvedValue(run);
  mocks.service.runCheck.mockResolvedValue(run);
});

describe("AI visibility assistant tools", () => {
  it("registers the same tools in MCP and SAM and hides SAM's project argument", () => {
    const register = vi.spyOn(McpServer.prototype, "registerTool");
    createOpenSeoMcpServer({ openSeoAuth: context.auth });
    const sam = buildSamMcpTools(context.auth, {
      id: projectId,
      domain: "example.com",
    });
    const tools = Object.values(definitions);
    for (const tool of tools) {
      expect(register.mock.calls.some(([name]) => name === tool.name)).toBe(
        true,
      );
      expect(sam[tool.name]).toBeDefined();
      const schema = sam[tool.name]?.inputSchema;
      expect(schema).toBeInstanceOf(z.ZodObject);
      if (schema instanceof z.ZodObject)
        expect(schema.shape).not.toHaveProperty("projectId");
    }
    register.mockRestore();
  });
  it.each(["get_ai_visibility_results", "get_ai_visibility_sources"])(
    "lets SAM express one run-wide %s call with null filters",
    async (name) => {
      const sam = buildSamMcpTools(context.auth, {
        id: projectId,
        domain: "example.com",
      });
      const schema = sam[name]?.inputSchema;
      if (!(schema instanceof z.ZodObject))
        throw new Error("Missing SAM object schema");
      const filters = {
        runId: null,
        topic: null,
        engines: null,
        promptId: null,
        cursor: null,
      };
      expect(schema.parse(filters)).toMatchObject(filters);
      expect(schema.shape).not.toHaveProperty("projectId");
      const jsonSchema = z.toJSONSchema(schema, { io: "input" });
      expect(JSON.stringify(jsonSchema.properties?.engines)).toContain(
        '"type":"null"',
      );
      expect(JSON.stringify(jsonSchema.properties?.topic)).toContain(
        "Omit or null for all topics",
      );
      expect(sam[name]?.description).toContain("one run-wide call");
    },
  );
  it("returns a typed empty setup and useful link without collecting", async () => {
    const result = await definitions.getAiVisibilityTrackerTool.handler(
      { projectId },
      context,
    );
    expect(result.structuredContent).toMatchObject({
      status: "success",
      data: state,
      meta: {
        projectId,
        url: `https://open-seo.test/p/${projectId}/ai-visibility`,
      },
    });
    expect(
      definitions.getAiVisibilityTrackerTool.config.outputSchema.safeParse(
        result.structuredContent,
      ).success,
    ).toBe(true);
    expect(textContent(result)).toContain("not configured");
    expect(mocks.service.runCheck).not.toHaveBeenCalled();
  });
  it("accepts a self-hosted project ID and authorizes it before reading the tracker", async () => {
    const projectId = "proj-realwriteapp-com";
    mocks.authorize.mockResolvedValue({
      id: projectId,
      domain: "realwriteapp.com",
    });
    const args = z
      .object(definitions.getAiVisibilityTrackerTool.config.inputSchema)
      .parse({ projectId });
    const result = await definitions.getAiVisibilityTrackerTool.handler(
      args,
      context,
    );
    expect(result.structuredContent).toMatchObject({
      status: "success",
      meta: { projectId },
    });
    expect(mocks.service.getTracker).toHaveBeenCalledWith({ projectId });
    expect(mocks.authorize).toHaveBeenCalled();
  });
  it("keeps the same public evidence in text-only clients", async () => {
    const brands = [{ name: "Ahrefs", domain: "ahrefs.com", own: false }];
    mocks.service.getTracker.mockResolvedValue({ ...state, brands });
    const result = await definitions.getAiVisibilityTrackerTool.handler(
      { projectId },
      context,
    );
    const text = textContent(result);
    const jsonLine = text
      .split("\n")
      .find((line) => line.startsWith('{"status":'));
    expect(jsonLine).toBeDefined();
    expect(JSON.parse(jsonLine!)).toEqual({
      status: "success",
      data: { ...state, brands },
    });
    expect(result.structuredContent).toMatchObject({
      status: "success",
      data: { ...state, brands },
    });
  });
  it("authorizes before any service read and never exposes a foreign project", async () => {
    mocks.authorize.mockResolvedValue(null);
    await expect(
      definitions.getAiVisibilityTrackerTool.handler({ projectId }, context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.service.getTracker).not.toHaveBeenCalled();
  });
  it("reads existing progress once without starting another check", async () => {
    const result = await definitions.getAiVisibilityRunTool.handler(
      { projectId, runId },
      context,
    );
    expect(mocks.service.getRun).toHaveBeenCalledExactlyOnceWith({
      projectId,
      runId,
    });
    expect(mocks.service.runCheck).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({
      data: { pending: 2 },
    });
    expect(textContent(result)).toContain("Next read after 30s");
    expect(
      definitions.getAiVisibilityRunTool.config.outputSchema.safeParse(
        result.structuredContent,
      ).success,
    ).toBe(true);
  });
  it("forwards the paid check's scope, approved cost and authorized billing", async () => {
    const args = { projectId, maxCostUsd: 0.01, promptIds: [runId] };
    await definitions.runAiVisibilityCheckTool.handler(args, context);
    expect(mocks.service.runCheck).toHaveBeenCalledWith(
      args,
      expect.objectContaining({ organizationId: "org_123", projectId }),
    );
  });
  it("returns actionable typed conflicts with their run ID without retrying", async () => {
    mocks.service.runCheck.mockRejectedValue(
      new AiVisibilityError(
        "RUN_IN_PROGRESS",
        "A check is already collecting answers.",
        runId,
      ),
    );
    const result = await definitions.runAiVisibilityCheckTool.handler(
      { projectId, maxCostUsd: 0.01 },
      context,
    );
    expect(result.isError).toBe(true);
    expect(textContent(result)).toContain("Do not start another check");
    expect(result.structuredContent).toMatchObject({
      status: "error",
      code: "RUN_IN_PROGRESS",
      runId,
    });
    expect(
      definitions.runAiVisibilityCheckTool.config.outputSchema.safeParse(
        result.structuredContent,
      ).success,
    ).toBe(true);
    expect(mocks.service.runCheck).toHaveBeenCalledTimes(1);
  });
  it("keeps gap-only source scope visible in structured and text-only MCP clients", async () => {
    const sourceData = {
      runId,
      rows: [],
      totalCount: 0,
      nextCursor: null,
      coverage: {
        expected: 3,
        completed: 3,
        noAnswer: 0,
        failed: 0,
        pending: 0,
      },
      appliedFilters: {
        competitorGap: true,
        branded: "branded",
        ownership: "all",
      },
      groupBy: "url",
      truncated: false,
    };
    mocks.service.getSources.mockResolvedValue(sourceData);
    const schema = z.object(
      definitions.getAiVisibilitySourcesTool.config.inputSchema,
    );
    const result = await definitions.getAiVisibilitySourcesTool.handler(
      schema.parse({
        projectId,
        runId,
        competitorGap: true,
        branded: "branded",
      }),
      context,
    );
    expect(result.structuredContent).toMatchObject({
      data: { appliedFilters: sourceData.appliedFilters },
    });
    expect(textContent(result)).toContain("Gap-only sources");
    expect(textContent(result)).toContain(
      "does not mean answer details are missing",
    );
    expect(textContent(result)).toContain('"competitorGap":true');
  });
  it("explains zero gap-filtered results without calling completed evidence missing", async () => {
    mocks.service.getResults.mockResolvedValue({
      runId,
      run,
      rows: [],
      totalCount: 0,
      nextCursor: null,
      summaries: [],
      coverage: {
        expected: 3,
        completed: 3,
        noAnswer: 0,
        failed: 0,
        pending: 0,
      },
      appliedFilters: { competitorGap: true, branded: "branded" },
      truncated: false,
    });
    const schema = z.object(
      definitions.getAiVisibilityResultsTool.config.inputSchema,
    );
    const result = await definitions.getAiVisibilityResultsTool.handler(
      schema.parse({
        projectId,
        runId,
        competitorGap: true,
        branded: "branded",
      }),
      context,
    );
    expect(textContent(result)).toContain("Gap-only results");
    expect(textContent(result)).toContain(
      "No answers matched the selected filters",
    );
    expect(textContent(result)).toContain("Remove restrictive filters");
  });
  it("rejects malformed success and incomplete error payloads at the output boundary", () => {
    const schema = definitions.getAiVisibilityRunTool.config.outputSchema;
    expect(schema.safeParse({ status: "success" }).success).toBe(false);
    expect(
      schema.safeParse({ status: "success", data: { ...run, completed: "1" } })
        .success,
    ).toBe(false);
    expect(schema.safeParse({ status: "error", message: "bad" }).success).toBe(
      false,
    );
  });
});
