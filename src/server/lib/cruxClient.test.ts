import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequiredEnvValue: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: mocks.getRequiredEnvValue,
}));

import { queryHistoryRecord, queryRecord } from "@/server/lib/cruxClient";
import { CruxApiError } from "@/server/lib/cruxErrors";

const fetchMock = mocks.fetch;

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

beforeEach(() => {
  mocks.getRequiredEnvValue.mockResolvedValue("test-crux-key");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cruxClient", () => {
  it("posts the origin body with the key in the query string and returns the record", async () => {
    const record = {
      key: { origin: "https://example.com", formFactor: "PHONE" },
      metrics: {
        largest_contentful_paint: { percentiles: { p75: 1801 } },
      },
    };
    fetchMock.mockResolvedValue(jsonResponse({ record }));

    const result = await queryRecord({ origin: "https://example.com" });

    expect(result).toEqual({ status: "ok", record });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=test-crux-key",
    );
    expect(init?.method).toBe("POST");
    const body = init?.body;
    const payload =
      typeof body === "string" ? (JSON.parse(body) as unknown) : null;
    expect(payload).toEqual({
      origin: "https://example.com",
      formFactor: "PHONE",
    });
  });

  it("targets the history endpoint and prefers url over origin", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ record: { key: {} } }));

    await queryHistoryRecord({
      url: "https://example.com/pricing",
      formFactor: "DESKTOP",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord?key=test-crux-key",
    );
    const body = init?.body;
    const payload =
      typeof body === "string" ? (JSON.parse(body) as unknown) : null;
    expect(payload).toEqual({
      url: "https://example.com/pricing",
      formFactor: "DESKTOP",
    });
  });

  it("maps 404 to a no-data result instead of throwing", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 404, status: "NOT_FOUND" } }, 404),
    );

    await expect(
      queryRecord({ origin: "https://tiny.example" }),
    ).resolves.toEqual({ status: "no_data" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries a 5xx twice before throwing CruxApiError", async () => {
    fetchMock.mockResolvedValue(
      new Response("upstream failure", { status: 503 }),
    );

    await expect(
      queryRecord({ origin: "https://example.com" }),
    ).rejects.toBeInstanceOf(CruxApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps 403 to the API-disabled message without retrying", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 403, status: "PERMISSION_DENIED" } }, 403),
    );

    await expect(
      queryRecord({ origin: "https://example.com" }),
    ).rejects.toThrow(
      "Chrome UX Report API is disabled for this API key's Google Cloud project. Enable it in the Google Cloud console.",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
