import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIndexNowClient,
  IndexNowApiError,
} from "@/server/lib/indexnowClient";

const input = {
  host: "example.com",
  key: "abc123",
  keyLocation: "https://example.com/abc123.txt",
  urlList: ["https://example.com/page"],
};

describe("IndexNow client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the IndexNow payload and accepts 200/202 responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("accepted", { status: 202 }),
    );
    const client = createIndexNowClient(fetchMock);

    await expect(client.submitUrls(input)).resolves.toEqual({
      status: "submitted",
      httpStatus: 202,
      responseBody: "accepted",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.indexnow.org/indexnow",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
  });

  it.each([
    [400, false, "invalid"],
    [403, false, "verify"],
    [422, false, "not on host"],
    [429, true, "rate limit"],
  ])("maps HTTP %s with retryable=%s", async (status, retryable) => {
    const client = createIndexNowClient(
      vi.fn().mockResolvedValue(new Response("upstream", { status })),
    );

    const error = await client.submitUrls(input).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(IndexNowApiError);
    if (!(error instanceof IndexNowApiError)) throw new Error("Expected IndexNowApiError");
    expect(error).toMatchObject({ status, retryable });
    expect(error.message.toLowerCase()).toContain(
      retryable ? "rate limit" : status === 403 ? "verify" : status === 422 ? "not on" : "invalid",
    );
  });

  it("rejects a request larger than the IndexNow limit before fetching", async () => {
    const fetchMock = vi.fn();
    const client = createIndexNowClient(fetchMock);

    await expect(
      client.submitUrls({ ...input, urlList: Array.from({ length: 10_001 }, (_, i) => `https://example.com/${i}`) }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
