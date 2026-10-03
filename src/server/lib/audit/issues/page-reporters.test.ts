import { describe, expect, it } from "vitest";
import { runPageReporters } from "@/server/lib/audit/issues/page-reporters";
import { analyzeHtml } from "@/server/lib/audit/page-analyzer";
import {
  findDuplicates,
  findRedirectChainsAndLoops,
  type SlimPage,
} from "@/server/lib/audit/issues/multipage-checks";
import type { CrawledPageResult, PageLink } from "@/server/lib/audit/types";

const HEALTHY_LINK: PageLink = {
  targetUrl: "https://example.com/catalog",
  anchor: "Catalog",
  isInternal: true,
  isNofollow: false,
};

function makePage(overrides: Partial<CrawledPageResult>): CrawledPageResult {
  return {
    id: "page-1",
    url: "https://example.com/a",
    statusCode: 200,
    fetchClass: "ok",
    redirectUrl: null,
    title: "A perfectly reasonable page title",
    metaDescription:
      "A reasonable meta description that says something useful about the page.",
    canonicalUrl: null,
    robotsMeta: null,
    xRobotsTag: null,
    headerCanonicalUrl: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    h1Count: 1,
    h2Count: 0,
    h3Count: 0,
    h4Count: 0,
    h5Count: 0,
    h6Count: 0,
    headingOrder: [1, 2, 3],
    wordCount: 500,
    contentHash: "abc123",
    isHtml: true,
    htmlBytes: 10_000,
    rateLimited: false,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    images: [],
    links: [HEALTHY_LINK],
    hasStructuredData: false,
    hreflangTags: [],
    isIndexable: true,
    responseTimeMs: 200,
    crawlDepth: 1,
    inSitemap: true,
    ...overrides,
  };
}

function issueTypes(page: CrawledPageResult): string[] {
  return runPageReporters(page).map((issue) => issue.issueType);
}

describe("meta description extraction and reporting", () => {
  it.each(["description", "Description", "DESCRIPTION", "dEsCrIpTiOn"])(
    "does not report a missing description for name=%s",
    (name) => {
      const analysis = analyzeHtml(
        `<head><meta name="${name}" content="Actual text"></head>`,
        "https://example.com/a",
        200,
        0,
      );

      expect(
        issueTypes(makePage({ metaDescription: analysis.metaDescription })),
      ).not.toContain("missing-meta-description");
    },
  );

  it.each([
    ["absent", ""],
    ["empty", '<meta name="description" content="">'],
    ["empty with mixed case", '<meta name="Description" content="">'],
    ["whitespace only", '<meta name="DESCRIPTION" content="   ">'],
    ["missing content", '<meta name="dEsCrIpTiOn">'],
  ])("reports a missing description when %s", (_label, meta) => {
    const analysis = analyzeHtml(
      `<head>${meta}</head>`,
      "https://example.com/a",
      200,
      0,
    );

    expect(analysis.metaDescription).toBe("");
    expect(
      issueTypes(makePage({ metaDescription: analysis.metaDescription })),
    ).toContain("missing-meta-description");
  });
});

describe("runPageReporters", () => {
  it("keeps known signals on an unread shell without inventing missing-content issues", () => {
    const types = issueTypes(
      makePage({
        javascriptShell: true,
        title: "",
        metaDescription: "",
        h1Count: 0,
        wordCount: 1,
        links: [],
        isIndexable: false,
        robotsMeta: "noindex",
        canonicalUrl: "https://example.com/canonical",
        headerCanonicalUrl: "https://example.com/header-canonical",
        responseTimeMs: 2000,
        crawlDepth: 5,
      }),
    );
    expect(types).toEqual([
      "slow-response",
      "noindex-page",
      "canonical-conflict",
      "canonicalized-page",
      "deep-page",
      "javascript-rendering-suspected",
    ]);
  });

  it("reports nothing for a healthy page", () => {
    expect(issueTypes(makePage({}))).toEqual([]);
  });

  // A fetch that never produced a page yields exactly its fetch issue, and
  // none of the content checks.
  it.each([
    [{ fetchClass: "blocked", statusCode: 403 }, ["blocked-page"]],
    [{ fetchClass: "rate_limited", statusCode: 429 }, ["rate-limited-page"]],
    [{ fetchClass: "error", statusCode: 0 }, []],
  ] as const)("reports %o as %j", (overrides, expected) => {
    expect(issueTypes(makePage(overrides))).toEqual(expected);
  });

  it("classifies error statuses by range", () => {
    expect(issueTypes(makePage({ statusCode: 500 }))).toEqual(["server-error"]);
    expect(issueTypes(makePage({ statusCode: 404 }))).toEqual(["broken-page"]);
    expect(
      issueTypes(
        makePage({
          statusCode: 301,
          redirectUrl: "https://example.com/b",
        }),
      ),
    ).toEqual([]);
  });

  it.each<[Partial<CrawledPageResult>, string]>([
    [{ title: "" }, "missing-title"],
    [{ title: "x".repeat(70) }, "title-too-long"],
    [{ title: "Tiny" }, "title-too-short"],
    [{ metaDescription: "" }, "missing-meta-description"],
    [{ metaDescription: "x".repeat(200) }, "meta-description-too-long"],
    [{ metaDescription: "x".repeat(69) }, "meta-description-too-short"],
    [{ h1Count: 0 }, "missing-h1"],
    [{ h1Count: 3 }, "multiple-h1"],
    [{ headingOrder: [1, 2, 4] }, "heading-order-skip"],
    [{ wordCount: 50 }, "thin-content"],
    [{ responseTimeMs: 3000 }, "slow-response"],
    [{ crawlDepth: 6 }, "deep-page"],
    [{ links: [] }, "no-outgoing-links"],
  ])("flags %o as %s", (overrides, issueType) => {
    expect(issueTypes(makePage(overrides))).toContain(issueType);
  });

  it.each<[Partial<CrawledPageResult>, string]>([
    [{ metaDescription: "x".repeat(70) }, "meta-description-too-short"],
    [
      { wordCount: 50, isIndexable: false, robotsMeta: "noindex" },
      "thin-content",
    ],
    [{ crawlDepth: null }, "deep-page"],
    [{ links: [], isIndexable: false }, "no-outgoing-links"],
  ])("does not flag %o as %s", (overrides, issueType) => {
    expect(issueTypes(makePage(overrides))).not.toContain(issueType);
  });

  it("reports the measured length with a short meta description", () => {
    expect(
      runPageReporters(makePage({ metaDescription: "x".repeat(69) })).find(
        (issue) => issue.issueType === "meta-description-too-short",
      )?.details,
    ).toEqual({ length: 69 });
  });

  // The same empty shell: a PDF gets no content checks, an HTML page all of them.
  it.each([
    [false, []],
    [
      true,
      [
        "missing-title",
        "missing-meta-description",
        "missing-h1",
        "thin-content",
      ],
    ],
  ])("with isHtml %s an empty shell reports %j", (isHtml, expected) => {
    expect(
      issueTypes(
        makePage({
          isHtml,
          title: "",
          metaDescription: "",
          h1Count: 0,
          headingOrder: [],
          wordCount: 0,
          contentHash: null,
        }),
      ),
    ).toEqual(expected);
  });

  it("flags indexability and canonical signals", () => {
    expect(
      issueTypes(makePage({ isIndexable: false, robotsMeta: "noindex" })),
    ).toContain("noindex-page");

    const conflicted = issueTypes(
      makePage({
        canonicalUrl: "https://example.com/canonical-a",
        headerCanonicalUrl: "https://example.com/canonical-b",
      }),
    );
    expect(conflicted).toContain("canonical-conflict");
    expect(conflicted).toContain("canonicalized-page");

    expect(
      issueTypes(makePage({ canonicalUrl: "https://example.com/a" })),
    ).not.toContain("canonicalized-page");
  });
});

function makeSlimPage(overrides: Partial<SlimPage>): SlimPage {
  return {
    id: overrides.url ?? "page",
    url: "https://example.com/a",
    statusCode: 200,
    fetchClass: "ok",
    title: null,
    metaDescription: null,
    contentHash: null,
    redirectUrl: null,
    wordCount: 100,
    isIndexable: true,
    canonicalUrl: null,
    headerCanonicalUrl: null,
    ...overrides,
  };
}

describe("findDuplicates", () => {
  it("flags duplicate titles across pages and includes the other URLs", () => {
    const issues = findDuplicates([
      makeSlimPage({ url: "https://example.com/a", title: "Same" }),
      makeSlimPage({ url: "https://example.com/b", title: "Same" }),
      makeSlimPage({ url: "https://example.com/c", title: "Different" }),
    ]);
    const duplicateTitles = issues.filter(
      (issue) => issue.issueType === "duplicate-title",
    );
    expect(duplicateTitles).toHaveLength(2);
    expect(duplicateTitles[0].details?.otherUrls).toEqual([
      "https://example.com/b",
    ]);
  });

  it("excludes noindexed, canonicalized, and blocked pages from duplicate groups", () => {
    const issues = findDuplicates([
      makeSlimPage({ url: "https://example.com/a", title: "Same" }),
      makeSlimPage({
        url: "https://example.com/b",
        title: "Same",
        canonicalUrl: "https://example.com/a",
      }),
      makeSlimPage({
        url: "https://example.com/c",
        title: "Same",
        isIndexable: false,
      }),
      makeSlimPage({
        url: "https://example.com/d",
        title: "Same",
        fetchClass: "blocked",
        statusCode: 403,
      }),
    ]);
    expect(issues).toHaveLength(0);
  });

  it("groups duplicate content by hash only when there is text", () => {
    const issues = findDuplicates([
      makeSlimPage({ url: "https://example.com/a", contentHash: "h1" }),
      makeSlimPage({ url: "https://example.com/b", contentHash: "h1" }),
      makeSlimPage({
        url: "https://example.com/empty-1",
        contentHash: "h2",
        wordCount: 0,
      }),
      makeSlimPage({
        url: "https://example.com/empty-2",
        contentHash: "h2",
        wordCount: 0,
      }),
    ]);
    expect(
      issues.filter((issue) => issue.issueType === "duplicate-content"),
    ).toHaveLength(2);
  });
});

describe("findRedirectChainsAndLoops", () => {
  const redirect = (url: string, target: string) =>
    makeSlimPage({ url, statusCode: 301, redirectUrl: target });

  it("ignores single redirects", () => {
    expect(
      findRedirectChainsAndLoops([
        redirect("https://example.com/a", "https://example.com/b"),
        makeSlimPage({ url: "https://example.com/b" }),
      ]),
    ).toHaveLength(0);
  });

  it("flags a chain once, on its head", () => {
    const issues = findRedirectChainsAndLoops([
      redirect("https://example.com/a", "https://example.com/b"),
      redirect("https://example.com/b", "https://example.com/c"),
      makeSlimPage({ url: "https://example.com/c" }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("redirect-chain");
    expect(issues[0].pageUrl).toBe("https://example.com/a");
    expect(issues[0].details?.hops).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
    ]);
  });

  it.each([
    [
      "a two-page loop",
      [
        redirect("https://example.com/a", "https://example.com/b"),
        redirect("https://example.com/b", "https://example.com/a"),
      ],
    ],
    [
      "a self-loop",
      [redirect("https://example.com/a", "https://example.com/a")],
    ],
  ])("flags %s once", (_case, pages) => {
    const issues = findRedirectChainsAndLoops(pages);
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("redirect-loop");
  });
});
