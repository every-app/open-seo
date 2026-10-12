import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import {
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
  it.each([
    {
      input: "Example.com",
      options: undefined,
      expected: {
        apiTarget: "example.com",
        displayTarget: "example.com",
        scope: "subdomains",
        includeSubdomains: true,
        path: "",
      },
    },
    {
      input: "https://github.com/every-app/open-seo/",
      options: undefined,
      expected: {
        apiTarget: "github.com",
        displayTarget: "github.com/every-app/open-seo",
        scope: "subfolder",
        includeSubdomains: false,
        path: "/every-app/open-seo",
      },
    },
    {
      input: "https://Example.com/pricing",
      options: { scope: "subdomains" },
      expected: {
        apiTarget: "example.com",
        displayTarget: "example.com",
        scope: "subdomains",
        includeSubdomains: true,
        path: "",
      },
    },
  ] as const)(
    "maps $input with scope $options.scope onto includeSubdomains/path",
    ({ input, options, expected }) => {
      expect(normalizeBacklinksTarget(input, options)).toEqual(expected);
    },
  );

  it.each(["exact_url", "page"] as const)(
    "builds an absolute page URL for bare hostnames with scope %s",
    (scope) => {
      expect(normalizeBacklinksTarget("Example.com", { scope })).toEqual({
        apiTarget: "https://example.com/",
        displayTarget: "https://example.com/",
        scope: "exact_url",
        includeSubdomains: true,
        path: "",
      });
    },
  );

  it("rejects exact-url targets with query strings or fragments", () => {
    expectValidationError(() =>
      normalizeBacklinksTarget(
        "https://example.com/pricing?token=secret#hero",
        { scope: "exact_url" },
      ),
    );
  });
});

describe("fetchBacklinksSummary", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    await expect(
      fetchBacklinksSummary({ target: "example.com" }),
    ).rejects.toMatchObject({ code: "BACKLINKS_BILLING_ISSUE" });
  });

  it.each([[[null]], [[]]])(
    "treats a %j summary result as a valid zero-data response",
    async (result) => {
      vi.mocked(fetch).mockResolvedValue(okResponse(result));

      await expect(
        fetchBacklinksSummary({ target: "example.com" }),
      ).resolves.toMatchObject({ data: {} });
    },
  );

  it("asks DataForSEO to exclude subdomains for a domain-scoped target", async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse([]));

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

  it.each([undefined, false])(
    "preserves user filters and pagination with hideSpam=%s",
    async (hideSpam) => {
      const mode = "as_is";
      vi.mocked(fetch).mockResolvedValue(okResponse([]));
      const filters = [["domain_from", "=", "openseo.so"]];

      await fetchBacklinksRows({
        target: "openseo.so",
        mode,
        offset: 50,
        limit: 50,
        hideSpam,
        filters,
      });

      const body = vi.mocked(fetch).mock.calls[0]?.[1]?.body;
      if (typeof body !== "string")
        throw new Error("Expected a JSON request body");
      expect(JSON.parse(body)).toEqual([
        expect.objectContaining({
          mode,
          offset: 50,
          limit: 50,
          filters:
            hideSpam === false
              ? filters
              : [
                  ...filters,
                  "and",
                  [
                    ["backlink_spam_score", "<", 40],
                    "or",
                    ["backlink_spam_score", "=", null],
                  ],
                ],
        }),
      ]);
    },
  );
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
