import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteProjectAiObjects } from "./aiVisibilityStorage";
import { pruneAiVisibility } from "./aiVisibilityRetention";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  deleteObjects: vi.fn(),
  getCursor: vi.fn(),
  putCursor: vi.fn(),
  deleteCursor: vi.fn(),
  prune: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({
  env: {
    R2: { list: mocks.list, delete: mocks.deleteObjects },
    KV: {
      get: mocks.getCursor,
      put: mocks.putCursor,
      delete: mocks.deleteCursor,
    },
  },
}));
vi.mock("../repositories/aiVisibilityRetentionRepository", () => ({
  pruneAiHistory: mocks.prune,
}));

const now = new Date("2026-09-05T12:00:00Z");
const exportObject = (key: string, expiresAt?: string) => ({
  key,
  customMetadata: expiresAt ? { expiresAt } : {},
});
beforeEach(() => {
  vi.useFakeTimers({ now });
  mocks.getCursor.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe("AI visibility storage", () => {
  it("deletes all pages under the exact project's private prefix", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        objects: [{ key: "ai-visibility/project-a/exports/one" }],
        truncated: true,
        cursor: "page-two",
      })
      .mockResolvedValueOnce({
        objects: [{ key: "ai-visibility/project-a/exports/two" }],
        truncated: false,
      });
    const remove = vi.fn();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- this helper uses only list and delete on the bucket
    const bucket = { list, delete: remove } as unknown as R2Bucket;
    expect(await deleteProjectAiObjects(bucket, "project-a")).toBe(2);
    expect(list).toHaveBeenNthCalledWith(2, {
      prefix: "ai-visibility/project-a/",
      cursor: "page-two",
    });
    expect(remove.mock.calls).toEqual([
      [["ai-visibility/project-a/exports/one"]],
      [["ai-visibility/project-a/exports/two"]],
    ]);
  });

  it("sweeps one page of expired exports and resumes from the next page", async () => {
    mocks.getCursor.mockResolvedValue("page-one");
    mocks.list.mockResolvedValue({
      objects: [
        exportObject("ai-visibility/a/exports/expired", "2026-09-05T11:00:00Z"),
        exportObject("ai-visibility/a/exports/current", "2026-09-05T13:00:00Z"),
        exportObject("ai-visibility/a/exports/no-expiry"),
      ],
      truncated: true,
      cursor: "page-two",
    });

    await pruneAiVisibility();

    expect(mocks.prune).toHaveBeenCalledExactlyOnceWith(now);
    expect(mocks.deleteObjects).toHaveBeenCalledExactlyOnceWith([
      "ai-visibility/a/exports/expired",
      "ai-visibility/a/exports/no-expiry",
    ]);
    expect(mocks.putCursor).toHaveBeenCalledExactlyOnceWith(
      "ai-visibility:retention-cursor",
      "page-two",
    );
  });
});
