import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

const { classifyBacklinksError } = vi.hoisted(() => ({
  classifyBacklinksError: vi.fn(),
}));

// The classifier is built inside backlinks.ts via createDataforseoBillingClassifier;
// returning our hoisted mock lets the test drive classification.
vi.mock("@/server/lib/dataforseoBillingClassification", () => ({
  createDataforseoBillingClassifier: () => classifyBacklinksError,
}));

import {
  fetchBacklinksHistory,
  fetchBacklinksRows,
  fetchBacklinksSummary,
} from "@/server/lib/dataforseo/backlinks";
import { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinksTarget";

// A successful DataForSEO task always carries billing metadata (path + cost).
const billed = {
  path: ["v3", "backlinks", "summary", "live"],
  cost: 0.02,
  result_count: 0,
};

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

  it("rejects hostnames with unrecognized public suffixes before provider calls", () => {
    expectValidationError(() => normalizeBacklinksTarget("example.invalidtld"));
  });
});

describe("fetchBacklinksSummary", () => {
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
          status_code: 40200,
          status_message: "Account balance is too low",
          tasks: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    classifyBacklinksError.mockImplementation((status: number | undefined) => {
      if (status === 40200) {
        return new AppError(
          "BACKLINKS_BILLING_ISSUE",
          "The connected DataForSEO account has a billing or balance issue",
        );
      }
      return null;
    });

    await expect(
      fetchBacklinksSummary({ target: "example.com" }),
    ).rejects.toMatchObject({ code: "BACKLINKS_BILLING_ISSUE" });

    expect(classifyBacklinksError).toHaveBeenCalledWith(
      40200,
      expect.stringContaining("Account balance is too low"),
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
              ...billed,
              result: [null],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    classifyBacklinksError.mockReturnValue(null);

    await expect(
      fetchBacklinksSummary({ target: "not-a-real-input.example" }),
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
              ...billed,
              result: [],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    classifyBacklinksError.mockReturnValue(null);

    await expect(
      fetchBacklinksSummary({ target: "example.com" }),
    ).resolves.toMatchObject({ data: {} });
  });

  it("treats empty backlinks rows and history results as valid empty arrays", async () => {
    const emptyOk = () =>
      new Response(
        JSON.stringify({
          status_code: 20000,
          status_message: "Ok.",
          tasks: [
            {
              status_code: 20000,
              status_message: "Ok.",
              ...billed,
              result: [],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    vi.mocked(fetch)
      .mockResolvedValueOnce(emptyOk())
      .mockResolvedValueOnce(emptyOk());
    classifyBacklinksError.mockReturnValue(null);

    await expect(
      fetchBacklinksRows({ target: "example.com" }),
    ).resolves.toMatchObject({ data: { items: [], totalCount: null } });
    await expect(
      fetchBacklinksHistory({
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
