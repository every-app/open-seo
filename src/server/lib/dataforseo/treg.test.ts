import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  // No DataForSEO key, only a treg key: calls go through treg.
  getOptionalEnvValue: vi.fn(async (name: string) =>
    name === "TREG_API_TOKEN" ? "treg-key" : undefined,
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

  it("blames the treg balance only for a 402 treg made itself", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () =>
        Response.json(
          { error: "insufficient_balance" },
          { status: 402, headers: { "X-Treg-Error": "1" } },
        ),
      )
      // No X-Treg-Error: DataForSEO's own 402, relayed.
      .mockImplementationOnce(async () =>
        Response.json({ status_code: 40200 }, { status: 402 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      dataforseoPost("/v3/backlinks/summary/live", []),
    ).rejects.toThrow("Your treg balance is empty");
    await expect(
      dataforseoPost("/v3/backlinks/summary/live", []),
    ).rejects.toThrow("DataForSEO HTTP 402");
  });

  it("names TREG_API_TOKEN when treg refuses the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async () => {
        const response = Response.json(
          { error: "unauthorized" },
          { status: 401, headers: { "X-Treg-Error": "1" } },
        );
        // The Docker edition's runtime can't clone a fetched response.
        response.clone = () => {
          throw new TypeError(
            "Cannot clone a streaming response before consumption",
          );
        };
        return response;
      }),
    );

    await expect(
      dataforseoPost("/v3/backlinks/summary/live", []),
    ).rejects.toThrow("treg refused TREG_API_TOKEN");
  });
});
