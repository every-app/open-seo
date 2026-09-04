import { describe, expect, it, vi } from "vitest";
import {
  drainRetentionPages,
  RETENTION_DRAIN_MAX_PAGES,
  RETENTION_DRAIN_PAGE_SIZE,
} from "./RetentionDrain";

describe("retention drain", () => {
  it("stops at a stable capacity and preserves hasMore for continuation", async () => {
    const purgePage = vi.fn().mockResolvedValue({
      deleted: RETENTION_DRAIN_PAGE_SIZE,
      hasMore: true,
    });

    await expect(drainRetentionPages({ purgePage })).resolves.toEqual({
      deleted: RETENTION_DRAIN_PAGE_SIZE * RETENTION_DRAIN_MAX_PAGES,
      pages: RETENTION_DRAIN_MAX_PAGES,
      hasMore: true,
      stalled: false,
    });
    expect(purgePage).toHaveBeenCalledTimes(RETENTION_DRAIN_MAX_PAGES);
  });

  it("does not spin when a contested page reports more work without progress", async () => {
    const purgePage = vi.fn().mockResolvedValue({
      deleted: 0,
      hasMore: true,
    });

    await expect(drainRetentionPages({ purgePage })).resolves.toEqual({
      deleted: 0,
      pages: 1,
      hasMore: true,
      stalled: true,
    });
    expect(purgePage).toHaveBeenCalledOnce();
  });

  it("rejects a caller-supplied page budget above the stable bound", async () => {
    await expect(
      drainRetentionPages({
        maxPages: RETENTION_DRAIN_MAX_PAGES + 1,
        purgePage: vi.fn(),
      }),
    ).rejects.toThrow("between 1 and 20");
  });
});
