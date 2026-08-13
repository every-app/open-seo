import { beforeEach, describe, expect, it, vi } from "vitest";

const { onPageApiMock, lighthouseLiveJson } = vi.hoisted(() => ({
  onPageApiMock: vi.fn(),
  lighthouseLiveJson: vi.fn(),
}));

vi.mock("dataforseo-client", () => ({
  OnPageLighthouseLiveJsonRequestInfo: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock("@/server/lib/dataforseo/core", () => ({
  onPageApi: onPageApiMock,
}));

import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import { fetchLighthouseResult } from "@/server/lib/dataforseo/lighthouse";

beforeEach(() => {
  vi.clearAllMocks();
  onPageApiMock.mockReturnValue({ lighthouseLiveJson });
});

describe("fetchLighthouseResult", () => {
  it("carries billing metadata when parsing fails after a billed success", async () => {
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

    const rejection = fetchLighthouseResult({
      url: "https://example.com/",
      strategy: "mobile",
    });

    await expect(rejection).rejects.toBeInstanceOf(DataforseoChargedTaskError);
    await expect(rejection).rejects.toMatchObject({
      billing: {
        path: ["v3", "on_page", "lighthouse", "live", "json"],
        costUsd: 0.00425,
      },
    });
  });
});
