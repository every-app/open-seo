import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeToolContext, textContent } from "./tool-test-support";
import { getCloudflareTrafficHealthTool } from "./cloudflare-analytics-tools";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  trafficHealth: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock(
  "@/server/features/cloudflare-analytics/CloudflareAnalyticsService",
  () => ({
    CloudflareAnalyticsService: {
      trafficHealth: mocks.trafficHealth,
    },
  }),
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue({ id: "project_123" });
});

describe("Cloudflare Analytics MCP tools", () => {
  it("preserves bounded rate-limit backoff in text and structured output", async () => {
    mocks.trafficHealth.mockResolvedValue({
      source: "cloudflare_analytics",
      status: "rate_limited",
      window: {
        from: "2026-09-03T12:00:00.000Z",
        to: "2026-09-04T12:00:00.000Z",
        timezone: "UTC",
        granularity: "hour",
      },
      coverage: { sampled: false, truncated: false },
      retryAfterSeconds: 42,
      warnings: ["rate_limited"],
      data: null,
    });

    const result = await getCloudflareTrafficHealthTool.handler(
      {
        projectId: "project_123",
        from: "2026-09-03T12:00:00.000Z",
        to: "2026-09-04T12:00:00.000Z",
      },
      makeToolContext(),
    );

    expect(result.structuredContent).toMatchObject({
      status: "rate_limited",
      retryAfterSeconds: 42,
    });
    expect(textContent(result)).toContain("Retry after 42 seconds");
  });

  it("rejects windows over 31 days before calling Cloudflare", async () => {
    await expect(
      getCloudflareTrafficHealthTool.handler(
        {
          projectId: "project_123",
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-09-04T00:00:00.000Z",
        },
        makeToolContext(),
      ),
    ).rejects.toThrow("cannot exceed 31 days");
    expect(mocks.trafficHealth).not.toHaveBeenCalled();
  });
});
