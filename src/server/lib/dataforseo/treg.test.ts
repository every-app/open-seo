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
  it("sends DataForSEO calls to treg's DataForSEO path", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ status_code: 20000, tasks: [] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await dataforseoPost("/v3/backlinks/summary/live", [{ target: "a.com" }]);
    await dataforseoGet("/v3/serp/google/organic/task_get/advanced/abc");

    const [postUrl, postInit] = fetchMock.mock.calls[0];
    expect(postUrl).toBe(
      "https://treg.to/call/dataforseo/backlinks/summary/live",
    );
    expect(postInit?.body).toBe('[{"target":"a.com"}]');
    expect(new Headers(postInit?.headers).get("X-Treg-Token")).toBe("treg-key");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://treg.to/call/dataforseo/serp/google/organic/task_get/advanced/abc",
    );
  });
});
