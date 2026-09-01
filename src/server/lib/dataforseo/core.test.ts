import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn().mockResolvedValue("encoded-credentials"),
}));

import { onPageApi, serpTaskApi } from "@/server/lib/dataforseo/core";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DataForSEO OnPage transport", () => {
  it("does not retry a Lighthouse HTTP 5xx response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("upstream failure", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(onPageApi().lighthouseLiveJson([])).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("DataForSEO SERP task transport", () => {
  it("does not retry a billed task_post HTTP 5xx response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("upstream failure", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpTaskApi().googleMapsTaskPost([])).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
