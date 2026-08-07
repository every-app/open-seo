import { beforeEach, describe, expect, it, vi } from "vitest";
import { IndexNowApiError } from "@/server/lib/indexnowClient";

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  insert: vi.fn(),
  listByProjectId: vi.fn(),
  markAttempted: vi.fn(),
  markResult: vi.fn(),
  submitUrls: vi.fn(),
  batchSizes: [] as number[],
  IndexNowApiError: class extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "IndexNowApiError";
    }
    get retryable() {
      return this.status === 429 || this.status >= 500;
    }
  },
}));

vi.mock(
  "@/server/features/indexnow/repositories/IndexNowConfigRepository",
  () => ({
    IndexNowConfigRepository: {
      getByProjectId: mocks.config,
      upsert: vi.fn(),
      deleteByProjectId: vi.fn(),
    },
  }),
);
vi.mock(
  "@/server/features/indexnow/repositories/IndexingEventRepository",
  () => ({
    IndexingEventRepository: {
      insert: mocks.insert,
      listByProjectId: mocks.listByProjectId,
      markAttempted: mocks.markAttempted,
      markResult: mocks.markResult,
    },
  }),
);
vi.mock("@/server/lib/indexnowClient", () => {
  return {
    IndexNowApiError: mocks.IndexNowApiError,
    createIndexNowClient: () => ({ submitUrls: mocks.submitUrls }),
  };
});

const config = {
  id: "config-1",
  projectId: "project-1",
  organizationId: "org-1",
  host: "example.com",
  key: "abc123",
  keyLocation: "https://example.com/abc123.txt",
  enabled: true,
};

function makeEvent(id: string, url: string) {
  return {
    id,
    projectId: config.projectId,
    organizationId: config.organizationId,
    url,
    eventType: "submitted" as const,
    status: "pending" as const,
    httpStatus: null,
    responseBody: null,
    attempts: 0,
    createdAt: "2026-08-06T12:00:00.000Z",
    updatedAt: "2026-08-06T12:00:00.000Z",
  };
}

describe("IndexNowService.submitUrls", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of [
      mocks.config,
      mocks.insert,
      mocks.listByProjectId,
      mocks.markAttempted,
      mocks.markResult,
      mocks.submitUrls,
    ])
      mock.mockReset();
    mocks.batchSizes.length = 0;
    mocks.config.mockResolvedValue(config);
    mocks.insert.mockImplementation(({ url }: { url: string }) =>
      Promise.resolve(makeEvent(`event-${url}`, url)),
    );
    mocks.markAttempted.mockImplementation((id: string) =>
      Promise.resolve({ id }),
    );
    mocks.markResult.mockImplementation(
      (id: string, result: Record<string, unknown>) =>
        Promise.resolve({
          ...makeEvent(id, `https://example.com/${id}`),
          ...result,
          attempts: 1,
        }),
    );
  });

  it("batches URLs into small requests and records successful ledger events", async () => {
    mocks.submitUrls.mockImplementation(
      ({ urlList }: { urlList: string[] }) => {
        mocks.batchSizes.push(urlList.length);
        return Promise.resolve({
          status: "submitted",
          httpStatus: 200,
          responseBody: "ok",
        });
      },
    );
    const { IndexNowService } = await import("./IndexNowService");
    const urls = Array.from({ length: 205 }, (_, i) => `https://example.com/${i}`);

    const result = await IndexNowService.submitUrls({
      projectId: config.projectId,
      urls,
    });

    expect(mocks.submitUrls).toHaveBeenCalledTimes(3);
    expect(mocks.batchSizes).toEqual([100, 100, 5]);
    expect(mocks.insert).toHaveBeenCalledTimes(205);
    expect(mocks.markAttempted).toHaveBeenCalledTimes(205);
    expect(mocks.markResult).toHaveBeenCalledTimes(205);
    expect(result).toMatchObject({ submitted: 205, failed: 0 });
    expect(result.events).toHaveLength(205);
  });

  it("retries a rate limit and records the final successful attempt", async () => {
    vi.useFakeTimers();
    mocks.submitUrls
      .mockRejectedValueOnce(new IndexNowApiError(429, "slow down"))
      .mockResolvedValueOnce({
        status: "submitted",
        httpStatus: 202,
        responseBody: "accepted",
      });
    const { IndexNowService } = await import("./IndexNowService");
    const promise = IndexNowService.submitUrls({
      projectId: config.projectId,
      urls: ["https://example.com/retry"],
    });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toMatchObject({ submitted: 1, failed: 0 });
    expect(mocks.submitUrls).toHaveBeenCalledTimes(2);
    expect(mocks.markAttempted).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("records non-retryable API failures without dropping the ledger", async () => {
    mocks.submitUrls.mockRejectedValue(
      new IndexNowApiError(422, "URLs not on host", "bad url"),
    );
    const { IndexNowService } = await import("./IndexNowService");

    await expect(
      IndexNowService.submitUrls({
        projectId: config.projectId,
        urls: ["https://other.example/page"],
      }),
    ).resolves.toMatchObject({ submitted: 0, failed: 1 });
    expect(mocks.submitUrls).toHaveBeenCalledTimes(1);
    expect(mocks.markResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        eventType: "failed",
        status: "error",
        httpStatus: 422,
      }),
    );
  });
});
