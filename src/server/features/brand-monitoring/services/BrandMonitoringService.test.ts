import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRepo = {
  listConfigsByProject: vi.fn(),
  createConfig: vi.fn(),
  getConfigForProject: vi.fn(),
  touchLastChecked: vi.fn(),
  upsertMentions: vi.fn(),
  listMentions: vi.fn(),
};

vi.mock(
  "@/server/features/brand-monitoring/repositories/BrandMonitoringRepository",
  () => ({ BrandMonitoringRepository: mockRepo }),
);

const mockFetchGdeltMentions = vi.fn();
vi.mock("@/server/lib/gdeltClient", () => ({
  fetchGdeltMentions: (...args: unknown[]) => mockFetchGdeltMentions(...args),
}));

const { BrandMonitoringService } = await import("./BrandMonitoringService");

describe("BrandMonitoringService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects creating a duplicate monitor for the same query", async () => {
    mockRepo.listConfigsByProject.mockResolvedValue([
      { id: "1", projectId: "p1", query: "Pesapal" },
    ]);

    await expect(
      BrandMonitoringService.createConfig({
        projectId: "p1",
        query: "pesapal",
      }),
    ).rejects.toThrow();
  });

  it("creates a monitor when the query is new", async () => {
    mockRepo.listConfigsByProject.mockResolvedValue([]);
    mockRepo.createConfig.mockResolvedValue({
      id: "1",
      projectId: "p1",
      query: "Pesapal",
    });

    const result = await BrandMonitoringService.createConfig({
      projectId: "p1",
      query: "Pesapal",
    });

    expect(result).toEqual({ id: "1", projectId: "p1", query: "Pesapal" });
    expect(mockRepo.createConfig).toHaveBeenCalledWith({
      projectId: "p1",
      query: "Pesapal",
    });
  });

  it("fetches, upserts, and stamps lastCheckedAt on refresh", async () => {
    mockRepo.getConfigForProject.mockResolvedValue({
      id: "1",
      projectId: "p1",
      query: "Pesapal",
    });
    mockFetchGdeltMentions.mockResolvedValue([
      {
        sourceId: "https://example.com/a",
        title: "Pesapal launches new feature",
        url: "https://example.com/a",
        publishedAt: "2026-07-01T00:00:00Z",
        sentimentScore: 1.5,
        sentimentLabel: "neutral",
      },
    ]);
    mockRepo.upsertMentions.mockResolvedValue(1);

    const result = await BrandMonitoringService.refreshMentions({
      projectId: "p1",
      configId: "1",
    });

    expect(result).toEqual({ fetched: 1, inserted: 1 });
    expect(mockRepo.upsertMentions).toHaveBeenCalledWith(
      "1",
      expect.any(Array),
    );
    expect(mockRepo.touchLastChecked).toHaveBeenCalledWith(
      "1",
      expect.any(String),
    );
  });

  it("throws when refreshing a monitor that doesn't belong to the project", async () => {
    mockRepo.getConfigForProject.mockResolvedValue(null);

    await expect(
      BrandMonitoringService.refreshMentions({
        projectId: "p1",
        configId: "missing",
      }),
    ).rejects.toThrow();
  });
});
