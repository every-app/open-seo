import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { IndexNowFetcher } from "./IndexNowUrlPolicy";

const mocks = vi.hoisted(() => ({
  getProjectDomain: vi.fn(),
  getConfig: vi.fn(),
  upsertConfig: vi.fn(),
  markVerified: vi.fn(),
  recordSubmission: vi.fn(),
  listRecentSubmissions: vi.fn(),
}));

vi.mock("@/server/features/indexnow/IndexNowRepository", () => ({
  IndexNowRepository: {
    getProjectDomain: mocks.getProjectDomain,
    getConfig: mocks.getConfig,
    upsertConfig: mocks.upsertConfig,
    markVerified: mocks.markVerified,
    recordSubmission: mocks.recordSubmission,
    listRecentSubmissions: mocks.listRecentSubmissions,
  },
}));

import { IndexNowService } from "./IndexNowService";

const config = {
  id: "cfg_1",
  projectId: "project_1",
  organizationId: "org_1",
  publicKey: "0123456789abcdef0123456789abcdef",
  keyLocation: "https://www.example.com/0123456789abcdef0123456789abcdef.txt",
  keyVerifiedAt: "2026-09-04T10:00:00.000Z",
  generatedByUserId: "user_1",
  createdAt: "2026-09-04T09:00:00.000Z",
  updatedAt: "2026-09-04T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProjectDomain.mockResolvedValue("www.example.com");
  mocks.getConfig.mockResolvedValue(config);
  mocks.listRecentSubmissions.mockResolvedValue([]);
  mocks.markVerified.mockResolvedValue(true);
  mocks.recordSubmission.mockResolvedValue("submission_1");
});

describe("IndexNowService", () => {
  const publicDnsFetcher = vi.fn<IndexNowFetcher>(async (request) => {
    const url = new URL(request);
    const answer =
      url.searchParams.get("type") === "A"
        ? [{ type: 1, data: "203.0.113.10" }]
        : [];
    return new Response(JSON.stringify({ Status: 0, Answer: answer }), {
      status: 200,
    });
  });

  it("generates the 32-hex project key requested by the IndexNow proposal", async () => {
    mocks.upsertConfig.mockImplementation(
      async (input: { publicKey: string; keyLocation: string }) => ({
        ...config,
        publicKey: input.publicKey,
        keyLocation: input.keyLocation,
      }),
    );

    const result = await IndexNowService.configure({
      projectId: "project_1",
      organizationId: "org_1",
      userId: "user_1",
    });

    expect(result.publicKey).toMatch(/^[0-9a-f]{32}$/);
    expect(result.keyLocation).toBe(
      `https://www.example.com/${result.publicKey}.txt`,
    );
  });

  it("rejects a key location on another host", async () => {
    await expect(
      IndexNowService.configure({
        projectId: "project_1",
        organizationId: "org_1",
        userId: "user_1",
        keyLocation: "https://attacker.example/key.txt",
      }),
    ).rejects.toThrow("exact project host");
    expect(mocks.upsertConfig).not.toHaveBeenCalled();
  });

  it("verifies an exact same-host key file without following redirects", async () => {
    const fetcher = vi.fn<IndexNowFetcher>().mockResolvedValue(
      new Response(`${config.publicKey}\n`, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    await expect(
      IndexNowService.verifyKey("project_1", fetcher, publicDnsFetcher),
    ).resolves.toMatchObject({ verified: true });
    expect(fetcher).toHaveBeenCalledWith(
      config.keyLocation,
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(mocks.markVerified).toHaveBeenCalledWith(
      expect.objectContaining({
        configId: "cfg_1",
        publicKey: config.publicKey,
      }),
    );
  });

  it("caps the streamed key body", async () => {
    const fetcher = vi
      .fn<IndexNowFetcher>()
      .mockResolvedValue(new Response("x".repeat(257), { status: 200 }));
    await expect(
      IndexNowService.verifyKey("project_1", fetcher, publicDnsFetcher),
    ).rejects.toThrow("unexpectedly large");
    expect(mocks.markVerified).not.toHaveBeenCalled();
  });

  it("fails closed when the key host resolves to a private address", async () => {
    const keyFetcher = vi.fn<IndexNowFetcher>();
    const privateDnsFetcher = vi.fn<IndexNowFetcher>(async (request) => {
      const url = new URL(request);
      return new Response(
        JSON.stringify({
          Status: 0,
          Answer:
            url.searchParams.get("type") === "A"
              ? [{ type: 1, data: "127.0.0.1" }]
              : [],
        }),
      );
    });
    await expect(
      IndexNowService.verifyKey("project_1", keyFetcher, privateDnsFetcher),
    ).rejects.toThrow("publicly routable");
    expect(keyFetcher).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation", async () => {
    await expect(
      IndexNowService.submit({
        projectId: "project_1",
        userId: "user_1",
        urls: ["https://www.example.com/page"],
        confirmed: false,
      }),
    ).rejects.toThrow("confirmed: true");
  });

  it("rejects foreign, query-bearing, and private URLs before sending", async () => {
    const fetcher = vi.fn<IndexNowFetcher>();
    for (const url of [
      "https://other.example/page",
      "https://www.example.com/page?email=a@example.com",
      "https://www.example.com/admin/users",
    ]) {
      await expect(
        IndexNowService.submit({
          projectId: "project_1",
          userId: "user_1",
          urls: [url],
          confirmed: true,
          fetcher,
        }),
      ).rejects.toThrow("public HTTPS page");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("limits submissions to the directory containing a nested key file", async () => {
    mocks.getConfig.mockResolvedValue({
      ...config,
      keyLocation: "https://www.example.com/news/indexnow-key.txt",
    });
    const fetcher = vi
      .fn<IndexNowFetcher>()
      .mockResolvedValue(new Response(null, { status: 200 }));

    await expect(
      IndexNowService.submit({
        projectId: "project_1",
        userId: "user_1",
        urls: ["https://www.example.com/news/article"],
        confirmed: true,
        fetcher,
      }),
    ).resolves.toMatchObject({ status: "received" });

    await expect(
      IndexNowService.submit({
        projectId: "project_1",
        userId: "user_1",
        urls: ["https://www.example.com/help/article"],
        confirmed: true,
        fetcher,
      }),
    ).rejects.toThrow("within the key file directory");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized URL input before reading project configuration", async () => {
    const fetcher = vi.fn<IndexNowFetcher>();
    await expect(
      IndexNowService.submit({
        projectId: "project_1",
        userId: "user_1",
        urls: [`https://www.example.com/${"a".repeat(2_048)}`],
        confirmed: true,
        fetcher,
      }),
    ).rejects.toThrow("at most 2048");
    expect(mocks.getConfig).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("caps the aggregate URL payload before reading project configuration", async () => {
    const fetcher = vi.fn<IndexNowFetcher>();
    const urls = Array.from(
      { length: 1_100 },
      (_, index) => `https://www.example.com/${index}-${"a".repeat(1_950)}`,
    );

    await expect(
      IndexNowService.submit({
        projectId: "project_1",
        userId: "user_1",
        urls,
        confirmed: true,
        fetcher,
      }),
    ).rejects.toThrow("in total");
    expect(mocks.getConfig).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("deduplicates, chunks at 1,000, and keeps HTTP 202 pending without claiming indexation", async () => {
    const urls = Array.from(
      { length: 1_001 },
      (_, index) => `https://www.example.com/page-${index}`,
    );
    urls.push(urls[0]);
    const fetcher = vi
      .fn<IndexNowFetcher>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));

    const result = await IndexNowService.submit({
      projectId: "project_1",
      userId: "user_1",
      urls,
      confirmed: true,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const firstInit = fetcher.mock.calls[0]?.[1];
    if (typeof firstInit?.body !== "string") {
      throw new Error("expected an IndexNow JSON request body");
    }
    const firstBody = z
      .object({ urlList: z.array(z.string()) })
      .parse(JSON.parse(firstInit.body) as unknown);
    expect(firstBody.urlList).toHaveLength(1_000);
    expect(result).toMatchObject({
      status: "partially_received",
      requestedUrlCount: 1_002,
      uniqueUrlCount: 1_001,
      chunks: [
        { status: "received", httpStatus: 200 },
        { status: "pending", httpStatus: 202 },
      ],
    });
    expect(result.meaning).toContain("Neither status means");
    expect(mocks.recordSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        chunkCount: 2,
        receivedChunkCount: 1,
        pendingChunkCount: 1,
        failedChunkCount: 0,
        httpStatuses: [200, 202],
      }),
    );
  });

  it.each([
    [200, "received"],
    [202, "pending"],
    [400, "rejected"],
    [403, "rejected"],
    [422, "rejected"],
    [429, "failed"],
    [500, "failed"],
    [204, "failed"],
  ])("maps IndexNow HTTP %i to %s", async (httpStatus, status) => {
    const result = await IndexNowService.submit({
      projectId: "project_1",
      userId: "user_1",
      urls: ["https://www.example.com/page"],
      confirmed: true,
      fetcher: vi
        .fn<IndexNowFetcher>()
        .mockResolvedValue(new Response(null, { status: httpStatus })),
    });

    expect(result).toMatchObject({
      status,
      chunks: [{ status, httpStatus }],
    });
    expect(result.meaning).toContain("Neither status means");
  });
});
