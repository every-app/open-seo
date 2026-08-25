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

function okResponse(result: unknown[]) {
  return new Response(
    JSON.stringify({
      status_code: 20000,
      status_message: "Ok.",
      tasks: [{ status_code: 20000, status_message: "Ok.", ...billed, result }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("normalizeBacklinksTarget", () => {
  it("defaults inputs with a path to a subfolder lookup", () => {
    expect(
      normalizeBacklinksTarget("https://github.com/every-app/open-seo/"),
    ).toEqual({
      apiTarget: "github.com",
      displayTarget: "github.com/every-app/open-seo",
      scope: "subfolder",
      includeSubdomains: false,
      path: "/every-app/open-seo",
    });
  });

  it("strips query strings and fragments for subfolder lookups", () => {
    expect(
      normalizeBacklinksTarget("example.com/blog?utm_source=x#hero", {
        scope: "subfolder",
      }).path,
    ).toBe("/blog");
  });

  it("rejects subfolder scope without a path", () => {
    expectValidationError(() =>
      normalizeBacklinksTarget("example.com", { scope: "subfolder" }),
    );
  });

  it("defaults bare hostnames to subdomains scope", () => {
    expect(normalizeBacklinksTarget("Example.com")).toEqual({
      apiTarget: "example.com",
      displayTarget: "example.com",
      scope: "subdomains",
      includeSubdomains: true,
      path: "",
    });
  });

  it("includes subdomains only for subdomains scope", () => {
    expect(
      normalizeBacklinksTarget("https://Example.com/pricing", {
        scope: "subdomains",
      }),
    ).toEqual({
      apiTarget: "example.com",
      displayTarget: "example.com",
      scope: "subdomains",
      includeSubdomains: true,
      path: "",
    });
  });

  it("lets callers force a page lookup for bare hostnames", () => {
    expect(
      normalizeBacklinksTarget("Example.com", { scope: "exact_url" }),
    ).toEqual({
      apiTarget: "https://example.com/",
      displayTarget: "https://example.com/",
      scope: "exact_url",
      includeSubdomains: true,
      path: "",
    });
  });

  it("maps the legacy page scope onto exact_url", () => {
    expect(normalizeBacklinksTarget("Example.com", { scope: "page" })).toEqual({
      apiTarget: "https://example.com/",
      displayTarget: "https://example.com/",
      scope: "exact_url",
      includeSubdomains: true,
      path: "",
    });
  });

  it("rejects exact-url targets with query strings or fragments", () => {
    expectValidationError(() =>
      normalizeBacklinksTarget(
        "https://example.com/pricing?token=secret#hero",
        { scope: "exact_url" },
      ),
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
    vi.mocked(fetch).mockResolvedValue(okResponse([null]));
    classifyBacklinksError.mockReturnValue(null);

    await expect(
      fetchBacklinksSummary({ target: "not-a-real-input.example" }),
    ).resolves.toMatchObject({ data: {} });
  });

  it("treats empty summary results as a valid zero-data response", async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse([]));
    classifyBacklinksError.mockReturnValue(null);

    await expect(
      fetchBacklinksSummary({ target: "example.com" }),
    ).resolves.toMatchObject({ data: {} });
  });

  it("asks DataForSEO to exclude subdomains for a domain-scoped target", async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse([]));
    classifyBacklinksError.mockReturnValue(null);

    await fetchBacklinksSummary({
      target: "example.com",
      includeSubdomains: false,
    });

    const body = vi.mocked(fetch).mock.calls[0]?.[1]?.body;
    if (typeof body !== "string") {
      throw new Error("Expected DataForSEO request body to be a string");
    }
    expect(JSON.parse(body)).toMatchObject([
      { target: "example.com", include_subdomains: false },
    ]);
  });

  it("treats empty backlinks rows and history results as valid empty arrays", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(okResponse([]))
      .mockResolvedValueOnce(okResponse([]));
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
