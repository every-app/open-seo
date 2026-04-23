import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import type * as DataforseoBacklinksSupport from "@/server/lib/dataforseoBacklinksSupport";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

const { classifyBacklinksError } = vi.hoisted(() => ({
  classifyBacklinksError: vi.fn(),
}));

vi.mock("@/server/lib/dataforseoBacklinksSupport", async () => {
  const actual = await vi.importActual<typeof DataforseoBacklinksSupport>(
    "@/server/lib/dataforseoBacklinksSupport",
  );
  return { ...actual, classifyBacklinksError };
});

import {
  fetchBacklinksHistoryRaw,
  fetchBacklinksRowsRaw,
  fetchBacklinksSummaryRaw,
  normalizeBacklinksTarget,
} from "@/server/lib/dataforseoBacklinks";

describe("normalizeBacklinksTarget", () => {
  it("treats explicit homepage URLs as page lookups", () => {
    expect(normalizeBacklinksTarget("https://Example.com/")).toEqual({
      apiTarget: "https://example.com/",
      displayTarget: "https://example.com/",
      scope: "page",
    });
  });

  it("trims trailing slashes from non-root page URLs", () => {
    expect(
      normalizeBacklinksTarget("https://github.com/every-app/open-seo/"),
    ).toEqual({
      apiTarget: "https://github.com/every-app/open-seo",
      displayTarget: "https://github.com/every-app/open-seo",
      scope: "page",
    });
  });

  it("keeps trailing slashes for root page URLs", () => {
    expect(normalizeBacklinksTarget("https://example.com/")).toEqual({
      apiTarget: "https://example.com/",
      displayTarget: "https://example.com/",
      scope: "page",
    });
  });

  it("treats bare hostnames as domain lookups", () => {
    expect(normalizeBacklinksTarget("Example.com")).toEqual({
      apiTarget: "example.com",
      displayTarget: "example.com",
      scope: "domain",
    });
  });

  it("lets callers force domain scope for full URLs", () => {
    expect(
      normalizeBacklinksTarget("https://Example.com/pricing", {
        scope: "domain",
      }),
    ).toEqual({
      apiTarget: "example.com",
      displayTarget: "example.com",
      scope: "domain",
    });
  });

  it("normalizes domain scope for URLs with query strings or fragments", () => {
    expect(
      normalizeBacklinksTarget(
        "https://Example.com/pricing?utm_source=newsletter#hero",
        {
          scope: "domain",
        },
      ),
    ).toEqual({
      apiTarget: "example.com",
      displayTarget: "example.com",
      scope: "domain",
    });
  });

  it("lets callers force page scope for bare hostnames", () => {
    expect(normalizeBacklinksTarget("Example.com", { scope: "page" })).toEqual({
      apiTarget: "https://example.com/",
      displayTarget: "https://example.com/",
      scope: "page",
    });
  });

  it("rejects page targets with query strings or fragments", () => {
    expectValidationError(() =>
      normalizeBacklinksTarget("https://example.com/pricing?token=secret#hero"),
    );
  });

  it("rejects page targets with embedded credentials", () => {
    expectValidationError(() =>
      normalizeBacklinksTarget("https://user:pass@example.com/private"),
    );
  });
});

describe("fetchBacklinksSummaryRaw", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("classifies top-level DataForSEO body errors using status_code", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          status_code: 40204,
          status_message: "Backlinks subscription required",
          tasks: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    classifyBacklinksError.mockImplementation((status: number | undefined) => {
      if (status === 40204) {
        return new AppError(
          "BACKLINKS_NOT_ENABLED",
          "Backlinks is not enabled",
        );
      }
      return null;
    });

    await expect(
      fetchBacklinksSummaryRaw({
        target: "example.com",
      }),
    ).rejects.toMatchObject({ code: "BACKLINKS_NOT_ENABLED" });

    expect(classifyBacklinksError).toHaveBeenCalledWith(
      40204,
      expect.stringContaining("Backlinks subscription required"),
      "/v3/backlinks/summary/live",
    );
  });

  it("treats null summary results as a valid zero-data response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          status_code: 20000,
          status_message: "Ok.",
          tasks: [
            {
              status_code: 20000,
              status_message: "Ok.",
              result: [null],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    classifyBacklinksError.mockReturnValue(null);

    await expect(
      fetchBacklinksSummaryRaw({
        target: "not-a-real-input.example",
      }),
    ).resolves.toMatchObject({ data: {} });
  });

  it("treats empty summary results as a valid zero-data response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          status_code: 20000,
          status_message: "Ok.",
          tasks: [
            {
              status_code: 20000,
              status_message: "Ok.",
              result: [],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    classifyBacklinksError.mockReturnValue(null);

    await expect(
      fetchBacklinksSummaryRaw({
        target: "example.com",
      }),
    ).resolves.toMatchObject({ data: {} });
  });

  it("treats empty backlinks rows and history results as valid empty arrays", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status_code: 20000,
            status_message: "Ok.",
            tasks: [
              {
                status_code: 20000,
                status_message: "Ok.",
                result: [],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status_code: 20000,
            status_message: "Ok.",
            tasks: [
              {
                status_code: 20000,
                status_message: "Ok.",
                result: [],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    classifyBacklinksError.mockReturnValue(null);

    await expect(
      fetchBacklinksRowsRaw({
        target: "example.com",
      }),
    ).resolves.toMatchObject({ data: [] });
    await expect(
      fetchBacklinksHistoryRaw({
        target: "example.com",
        dateFrom: "2025-01-01",
        dateTo: "2025-12-31",
      }),
    ).resolves.toMatchObject({ data: [] });
  });
});

function expectValidationError(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
    return;
  }

  throw new Error("Expected normalizeBacklinksTarget to throw");
}
