import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateProjectContextTool } from "./project-context";
import { makeToolContext, textContent } from "./tool-test-support";

// The repository is the seam, not the service: the tool's contract is that an
// MCP write reaches storage attributed to MCP and reads back as the same digest
// the read tool returns, and only the real service proves both.
const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  listSections: vi.fn(),
  upsertSection: vi.fn(),
  listCompetitors: vi.fn(),
  listKeyPages: vi.fn(),
  listResearchLog: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/db/runBatch", () => ({
  runBatch: async (build: (tx: unknown) => readonly Promise<unknown>[]) => {
    for (const statement of build({})) await statement;
  },
}));

vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({ ProjectContextRepository: mocks }),
);

beforeEach(() => {
  mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
  mocks.listSections.mockResolvedValue([]);
  mocks.listCompetitors.mockResolvedValue([]);
  mocks.listKeyPages.mockResolvedValue([]);
  mocks.listResearchLog.mockResolvedValue([]);
});

describe("update_project_context", () => {
  // Provenance is the contract: a write arriving over MCP must be attributable
  // to MCP in the UI, and silently recording it as a user edit would be
  // invisible everywhere else.
  it("records writes as MCP-authored and answers with the context digest", async () => {
    // Empty before the write, stored after it, so the digest in the reply is
    // the post-write state and not an echo of the request.
    mocks.listSections.mockResolvedValueOnce([]);
    mocks.listSections.mockResolvedValue([
      {
        key: "current_goal",
        title: null,
        content: "Grow signups",
        updatedAt: "2026-08-15T10:00:00.000Z",
        updatedBy: "mcp",
      },
    ]);

    const result = await updateProjectContextTool.handler(
      {
        projectId: "project_1",
        updates: [{ section: "current_goal", content: "Grow signups" }],
      },
      makeToolContext(),
    );

    expect(mocks.upsertSection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: "project_1",
        key: "current_goal",
        content: "Grow signups",
        updatedBy: "mcp",
      }),
    );
    expect(textContent(result)).toContain("Grow signups");
  });
});
