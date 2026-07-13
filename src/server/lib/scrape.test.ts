import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPages, readSite } from "@/server/lib/scrape";

describe("readSite SSRF guard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks a metadata/private host without fetching it", async () => {
    const result = await readSite("169.254.169.254");

    expect(result.blocked).toBe(true);
    expect(result.pages).toEqual([]);
    // The blocked host must be rejected before any outbound page fetch.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks localhost-style targets", async () => {
    const result = await readSite("localhost:3000");

    expect(result.blocked).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("readPages SSRF guard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips private/metadata URLs without fetching them", async () => {
    const result = await readPages([
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:3000/admin",
    ]);

    expect(result.blocked).toBe(true);
    expect(result.pages).toEqual([]);
    // Every URL is validated before any outbound fetch.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns blocked for an empty URL list without fetching", async () => {
    const result = await readPages([]);

    expect(result.blocked).toBe(true);
    expect(result.pages).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
