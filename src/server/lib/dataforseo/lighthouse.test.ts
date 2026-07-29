import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dataforseo-client", () => ({
  OnPageLighthouseLiveJsonRequestInfo: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock("@/server/lib/dataforseo/core", () => ({
  onPageApi: vi.fn(),
}));

import { onPageApi } from "@/server/lib/dataforseo/core";
import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import { fetchLighthouseResult } from "@/server/lib/dataforseo/lighthouse";

const lighthouseLiveJson = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(onPageApi).mockReturnValue({
    lighthouseLiveJson,
  } as never);
});

describe("fetchLighthouseResult", () => {
  it("throws DataforseoChargedTaskError when parse fails after a billed success", async () => {
    lighthouseLiveJson.mockResolvedValue({
      status_code: 20000,
      status_message: "Ok.",
      tasks: [
        {
          id: "task-1",
          status_code: 20000,
          status_message: "Ok.",
          path: ["v3", "on_page", "lighthouse", "live", "json"],
          cost: 0.00425,
          result: [
            {
              requestedUrl: "https://example.com/",
              finalUrl: "https://example.com/",
              categories: {},
              audits: {},
            },
          ],
        },
      ],
    });

    try {
      await fetchLighthouseResult({
        url: "https://example.com/",
        strategy: "mobile",
      });
      throw new Error("expected fetchLighthouseResult to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DataforseoChargedTaskError);
      if (error instanceof DataforseoChargedTaskError) {
        expect(error.billing).toEqual({
          path: ["v3", "on_page", "lighthouse", "live", "json"],
          costUsd: 0.00425,
        });
        expect(error.message).toMatch(/no category scores/);
      }
    }
  });
});
