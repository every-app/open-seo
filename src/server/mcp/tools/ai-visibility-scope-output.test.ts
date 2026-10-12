import { expect, it, vi } from "vitest";
import { z } from "zod";
import * as definitions from "./ai-visibility-tools";
import { makeToolContext, textContent } from "./tool-test-support";
const mocks = vi.hoisted(() => ({
  service: { getResults: vi.fn(), getSources: vi.fn() },
}));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: async () => ({
      id: "00000000-0000-4000-8000-000000000001",
      domain: "example.com",
    }),
  },
}));
vi.mock("@/server/features/ai-visibility/services/AiVisibilityService", () => ({
  AiVisibilityService: mocks.service,
}));
const projectId = "00000000-0000-4000-8000-000000000001";
const runId = "00000000-0000-4000-8000-000000000002";
const context = makeToolContext();
const run = null;

it.each(["neutral", "branded", "all"] as const)(
  "puts the %s cohort before result and source totals",
  async (branded) => {
    const common = {
      runId,
      rows: [],
      totalCount: 0,
      nextCursor: null,
      coverage: {
        expected: 0,
        completed: 0,
        noAnswer: 0,
        failed: 0,
        pending: 0,
        unknown: 0,
      },
      appliedFilters: { competitorGap: false, branded },
      truncated: false,
    };
    mocks.service.getResults.mockResolvedValue({
      ...common,
      run,
      summaries: [],
    });
    mocks.service.getSources.mockResolvedValue({
      ...common,
      groupBy: "url",
      appliedFilters: { ...common.appliedFilters, ownership: "all" },
    });
    const expected =
      branded === "neutral"
        ? "Scope: neutral prompts only. Branded diagnostics are excluded; these are not whole-run totals."
        : branded === "branded"
          ? "Scope: branded diagnostics only. Neutral discovery prompts are excluded."
          : "Scope: neutral and branded prompts.";
    const results = definitions.getAiVisibilityResultsTool;
    const sources = definitions.getAiVisibilitySourcesTool;
    expect(
      textContent(
        await results.handler(
          z.object(results.config.inputSchema).parse({ projectId, branded }),
          context,
        ),
      ).startsWith(expected),
    ).toBe(true);
    expect(
      textContent(
        await sources.handler(
          z.object(sources.config.inputSchema).parse({ projectId, branded }),
          context,
        ),
      ).startsWith(expected),
    ).toBe(true);
  },
);
