import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import { fetchLighthouseResult } from "@/server/lib/dataforseo/lighthouse";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLighthouseResult", () => {
  it("carries billing metadata when parsing fails after a billed success", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
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
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

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

  it("does not retry an HTTP 5xx (the provider may have charged the task)", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("upstream failure", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchLighthouseResult({
        url: "https://example.com/",
        strategy: "mobile",
      }),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
