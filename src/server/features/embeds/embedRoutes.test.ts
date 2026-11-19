import { beforeEach, describe, expect, it, vi } from "vitest";
import { runEmbedCall } from "@/server/features/embeds/embedRoutes";

const mocks = vi.hoisted(() => ({
  env: { AUTH_MODE: "hosted" },
  getLinkByToken: vi.fn(),
  getProjectForOrganization: vi.fn(),
  getConfigs: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: mocks.env }));
vi.mock("@/server/features/embeds/EmbedRepository", () => ({
  EmbedRepository: { getLinkByToken: mocks.getLinkByToken },
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/rank-tracking/services/RankTrackingService", () => ({
  RankTrackingService: { getConfigs: mocks.getConfigs },
}));

const TOKEN = "e".repeat(32);

const LINK = {
  projectId: "project_1",
  organizationId: "org_1",
  archivedAt: null,
  userId: "user_1",
  userEmail: "owner@example.com",
  role: "owner",
};

const call = (body: unknown) =>
  runEmbedCall(
    TOKEN,
    new Request(`https://app.example.com/e/${TOKEN}/data`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  mocks.getLinkByToken.mockResolvedValue(LINK);
  mocks.getProjectForOrganization.mockResolvedValue({
    id: "project_1",
    domain: null,
  });
  mocks.getConfigs.mockResolvedValue([]);
});

describe("runEmbedCall", () => {
  it("runs the tool for the link's project, whatever project the request names", async () => {
    const response = await call({
      tool: "get_rank_tracker",
      arguments: { projectId: "someone_elses_project" },
    });

    expect(response.status).toBe(200);
    expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
      "org_1",
      "project_1",
    );
    expect(mocks.getConfigs).toHaveBeenCalledWith("project_1", null);
  });

  it("refuses tools the widgets don't use, such as paid research", async () => {
    const response = await call({
      tool: "get_serp_results",
      arguments: { keywords: ["plumber"] },
    });

    expect(response.status).toBe(400);
  });

  it.each([
    ["leaves the organization", null],
    ["can no longer manage integrations", "member"],
  ])("stops answering once the link's creator %s", async (_case, role) => {
    mocks.getLinkByToken.mockResolvedValue({ ...LINK, role });

    const response = await call({ tool: "get_rank_tracker", arguments: {} });

    expect(response.status).toBe(404);
    expect(mocks.getConfigs).not.toHaveBeenCalled();
  });
});
