import { describe, expect, it } from "vitest";
import { runPageReporters } from "@/server/lib/audit/issues/page-reporters";
import {
  findDuplicates,
  findRedirectChainsAndLoops,
  type SlimPage,
} from "@/server/lib/audit/issues/multipage-checks";
import type { CrawledPageResult } from "@/server/lib/audit/types";

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
    imagesTotal: 0,
    imagesMissingAlt: 0,
    images: [],
    links: [],
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

describe("runPageReporters", () => {
  it("reports nothing for a healthy page", () => {
    expect(issueTypes(makePage({}))).toEqual([]);
  });

  it("reports only blocked-page for a blocked fetch", () => {
    expect(
      issueTypes(makePage({ fetchClass: "blocked", statusCode: 403 })),
    ).toEqual(["blocked-page"]);
  });

  it("reports nothing for a fetch error", () => {
    expect(
      issueTypes(makePage({ fetchClass: "error", statusCode: 0 })),
    ).toEqual([]);
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

  it("checks titles and meta descriptions", () => {
    expect(issueTypes(makePage({ title: "" }))).toContain("missing-title");
    expect(issueTypes(makePage({ title: "x".repeat(70) }))).toContain(
      "title-too-long",
    );
    expect(issueTypes(makePage({ title: "Tiny" }))).toContain(
      "title-too-short",
    );
    expect(issueTypes(makePage({ metaDescription: "" }))).toContain(
      "missing-meta-description",
    );
    expect(
      issueTypes(makePage({ metaDescription: "x".repeat(200) })),
    ).toContain("meta-description-too-long");
  });

  it("checks headings", () => {
    expect(issueTypes(makePage({ h1Count: 0 }))).toContain("missing-h1");
    expect(issueTypes(makePage({ h1Count: 3 }))).toContain("multiple-h1");
    expect(issueTypes(makePage({ headingOrder: [1, 2, 4] }))).toContain(
      "heading-order-skip",
    );
  });

  it("skips content checks for non-HTML responses", () => {
    const nonHtml = makePage({
      isHtml: false,
      title: "",
      metaDescription: "",
      h1Count: 0,
      headingOrder: [],
      wordCount: 0,
      contentHash: null,
    });
    expect(issueTypes(nonHtml)).toEqual([]);
  });

  it("still checks empty-shell HTML pages", () => {
    const shell = makePage({
      isHtml: true,
      title: "",
      metaDescription: "",
      h1Count: 0,
      headingOrder: [],
      wordCount: 0,
      contentHash: null,
    });
    const types = issueTypes(shell);
    expect(types).toContain("missing-title");
    expect(types).toContain("missing-h1");
    expect(types).toContain("thin-content");
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

  it("flags thin content only on indexable pages", () => {
    expect(issueTypes(makePage({ wordCount: 50 }))).toContain("thin-content");
    expect(
      issueTypes(
        makePage({ wordCount: 50, isIndexable: false, robotsMeta: "noindex" }),
      ),
    ).not.toContain("thin-content");
  });

  it("flags slow responses and deep pages", () => {
    expect(issueTypes(makePage({ responseTimeMs: 3000 }))).toContain(
      "slow-response",
    );
    expect(issueTypes(makePage({ crawlDepth: 6 }))).toContain("deep-page");
    expect(issueTypes(makePage({ crawlDepth: null }))).not.toContain(
      "deep-page",
    );
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

  it("excludes noindexed and canonicalized pages from duplicate groups", () => {
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
    ]);
    expect(issues).toHaveLength(0);
  });

  it("ignores non-2xx and blocked pages", () => {
    const issues = findDuplicates([
      makeSlimPage({ url: "https://example.com/a", title: "Same" }),
      makeSlimPage({
        url: "https://example.com/b",
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

  it("flags loops", () => {
    const issues = findRedirectChainsAndLoops([
      redirect("https://example.com/a", "https://example.com/b"),
      redirect("https://example.com/b", "https://example.com/a"),
    ]);
    expect(
      issues.filter((issue) => issue.issueType === "redirect-loop").length,
    ).toBeGreaterThan(0);
  });

  it("flags self-loops", () => {
    const issues = findRedirectChainsAndLoops([
      redirect("https://example.com/a", "https://example.com/a"),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("redirect-loop");
  });
});
