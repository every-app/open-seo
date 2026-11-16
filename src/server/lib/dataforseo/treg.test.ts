import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  // No DataForSEO key, only a treg key: calls go through treg.
  getOptionalEnvValue: vi.fn(async (name: string) =>
    name === "TREG_API_KEY" ? "treg-key" : undefined,
  ),
  getRequiredEnvValue: vi.fn(),
}));

import { dataforseoGet, dataforseoPost } from "@/server/lib/dataforseo/core";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DataForSEO through treg", () => {
  it("calls the treg endpoint for the path, path params as query", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ status_code: 20000, tasks: [] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await dataforseoPost("/v3/backlinks/summary/live", [{ target: "a.com" }]);
    await dataforseoGet("/v3/business_data/google/reviews/task_get/abc%2F1");

    const [postUrl, postInit] = fetchMock.mock.calls[0];
    expect(postUrl).toBe(
      "https://treg.to/call/dataforseo.web.backlinks.summary",
    );
    expect(postInit?.body).toBe('[{"target":"a.com"}]');
    expect(new Headers(postInit?.headers).get("X-Treg-Token")).toBe("treg-key");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://treg.to/call/dataforseo.x.business-data-google-reviews-task-get?id=abc%2F1",
    );
  });

  // Rank tracking's task queue isn't in treg's catalog; it must fail with a
  // setup error, not reach treg or DataForSEO.
  it("refuses a path treg doesn't serve without calling out", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      dataforseoPost("/v3/serp/google/organic/task_post", []),
    ).rejects.toMatchObject({ code: "DATAFORSEO_AUTH_FAILED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
