import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeGa4Connection } from "./ga4-test-fixtures";
import { Ga4MeasurementHealthService } from "./Ga4MeasurementHealthService";

const mocks = vi.hoisted(() => ({
  getByProjectId: vi.fn(),
  listDataStreams: vi.fn(),
  getEnhancedMeasurementSettings: vi.fn(),
  listKeyEvents: vi.fn(),
  listCustomDimensions: vi.fn(),
  listCustomMetrics: vi.fn(),
}));

vi.mock("@/server/features/ga4/repositories/Ga4ConnectionRepository", () => ({
  Ga4ConnectionRepository: { getByProjectId: mocks.getByProjectId },
}));
vi.mock("@/server/lib/ga4Client", () => ({
  createGa4AdminClient: () => ({
    listDataStreams: mocks.listDataStreams,
    getEnhancedMeasurementSettings: mocks.getEnhancedMeasurementSettings,
    listKeyEvents: mocks.listKeyEvents,
    listCustomDimensions: mocks.listCustomDimensions,
    listCustomMetrics: mocks.listCustomMetrics,
  }),
}));

describe("Ga4MeasurementHealthService", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockResolvedValue(makeGa4Connection());
    mocks.listDataStreams.mockResolvedValue([
      {
        name: "properties/123/dataStreams/456",
        type: "WEB_DATA_STREAM",
        displayName: "Website",
        webStreamData: {
          measurementId: "G-ABC123",
          defaultUri: "https://example.com",
        },
      },
    ]);
    mocks.getEnhancedMeasurementSettings.mockResolvedValue({
      streamEnabled: true,
      siteSearchEnabled: false,
    });
    mocks.listKeyEvents.mockResolvedValue([
      {
        eventName: "purchase",
        countingMethod: "ONCE_PER_EVENT",
        custom: false,
      },
    ]);
    mocks.listCustomDimensions.mockResolvedValue([]);
    mocks.listCustomMetrics.mockResolvedValue([]);
  });

  it("returns a read-only measurement inventory and actionable issues", async () => {
    const result =
      await Ga4MeasurementHealthService.getMeasurementHealth("project_1");

    expect(result.issues).toEqual(["site_search_measurement_disabled"]);
    expect(result.webStreams[0]).toMatchObject({
      streamId: "456",
      measurementId: "G-ABC123",
      enhancedMeasurement: { siteSearchEnabled: false },
    });
  });
});
