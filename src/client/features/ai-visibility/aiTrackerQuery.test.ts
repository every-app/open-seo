import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAiVisibilityTracker } from "@/serverFunctions/ai-visibility";
import type { AiRun, AiTrackerState } from "@/shared/ai-visibility";
import { aiTrackerQueryOptions, aiVisibilityKey } from "./shared";

vi.mock("@/serverFunctions/ai-visibility", () => ({
  getAiVisibilityTracker: vi.fn(),
}));

const trend = [...aiVisibilityKey("p1"), "results", "trend", 7];

const tracker = (status: AiRun["status"]) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the query only reads recentRuns
  ({ recentRuns: [{ id: "run1", status }] }) as AiTrackerState;

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient();
  client.setQueryData(aiTrackerQueryOptions("p1").queryKey, tracker("running"));
  client.setQueryData(trend, { runs: [] });
});

describe("AI visibility tracker query", () => {
  it("marks answers read during a run stale once a read sees it finish", async () => {
    vi.mocked(getAiVisibilityTracker).mockResolvedValue(tracker("completed"));
    await client.fetchQuery({ ...aiTrackerQueryOptions("p1"), staleTime: 0 });
    expect(client.getQueryState(trend)?.isInvalidated).toBe(true);
  });

  it("leaves them alone while the run is still collecting", async () => {
    vi.mocked(getAiVisibilityTracker).mockResolvedValue(tracker("running"));
    await client.fetchQuery({ ...aiTrackerQueryOptions("p1"), staleTime: 0 });
    expect(client.getQueryState(trend)?.isInvalidated).toBe(false);
  });
});
