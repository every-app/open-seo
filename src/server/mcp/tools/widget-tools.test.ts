import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { showSerpResultsTool } from "./widget-tools";
import { makeToolContext } from "./tool-test-support";
import { rememberWidgetResult } from "@/server/mcp/widget-results";
import { WidgetTool } from "@/shared/mcp-contracts";
import type * as r2CacheModule from "@/server/lib/r2-cache";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  cache: new Map<string, unknown>(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/r2-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof r2CacheModule>()),
  getCached: async (key: string) => mocks.cache.get(key) ?? null,
  setCached: async (key: string, value: unknown) => {
    mocks.cache.set(key, value);
  },
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

describe("show_serp_results", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
  });

  it("shows a saved result only to the user and project that fetched it", async () => {
    const owner = makeToolContext();
    const saved = await rememberWidgetResult(
      WidgetTool.Serp,
      { projectId: "project_1" },
      {
        content: [{ type: "text", text: "rows" }],
        structuredContent: { results: [] },
      },
      owner.auth,
    );
    const { resultId } = z
      .object({ resultId: z.uuid() })
      .parse(saved.structuredContent);
    expect(JSON.stringify(saved.content.at(-1))).toContain(resultId);

    await expect(
      showSerpResultsTool.handler(
        { projectId: "project_1", resultId },
        makeToolContext({ userId: "user_other" }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      showSerpResultsTool.handler({ projectId: "project_2", resultId }, owner),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const shown = await showSerpResultsTool.handler(
      { projectId: "project_1", resultId },
      owner,
    );
    expect(shown._meta?.openSeoWidget).toMatchObject({
      data: { results: [], resultId },
    });
  });
});
