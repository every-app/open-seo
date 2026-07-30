import { describe, expect, it } from "vitest";
import { analyzeHtml } from "@/server/lib/audit/page-analyzer";

function page(body: string): string {
  return `<!doctype html><html><head><title>Test page</title>${body}</head><body><p>Hello</p></body></html>`;
}

function jsonLd(value: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
}

const URL = "https://example.com/a";

describe("analyzeHtml structured data", () => {
  it("reports null and hasStructuredData false when there is no JSON-LD", () => {
    const analysis = analyzeHtml(page(""), URL, 200, 100);
    expect(analysis.hasStructuredData).toBe(false);
    expect(analysis.structuredData).toBeNull();
  });

  it("summarizes clean markup with no errors", () => {
    const analysis = analyzeHtml(
      page(
        jsonLd({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Hello",
          image: "https://example.com/a.jpg",
          datePublished: "2026-07-30",
          dateModified: "2026-07-30",
          author: {
            "@type": "Person",
            name: "Jane",
            url: "https://example.com/jane",
          },
        }),
      ),
      URL,
      200,
      100,
    );

    expect(analysis.hasStructuredData).toBe(true);
    expect(analysis.structuredData).toMatchObject({
      blockCount: 1,
      errorCount: 0,
      ineligibleFeatures: [],
    });
    expect(analysis.structuredData?.types).toContain("Article");
  });

  it("counts broken markup separately from rich-result gaps", () => {
    const analysis = analyzeHtml(
      page(
        jsonLd({
          "@context": "https://schema.org",
          "@type": "Recipe",
          name: "Pavlova",
          datePublished: "sometime last week",
        }),
      ),
      URL,
      200,
      100,
    );

    const structuredData = analysis.structuredData;
    // The bad date is broken markup; the missing image is an unmet requirement.
    expect(structuredData?.errorCount).toBe(1);
    expect(structuredData?.errorMessages[0]).toContain("ISO 8601");
    expect(structuredData?.ineligibleFeatures).toEqual([
      {
        feature: "Recipe",
        missing: ["image"],
        docsUrl:
          "https://developers.google.com/search/docs/appearance/structured-data/recipe",
      },
    ]);
  });

  it("counts unparseable JSON as broken markup", () => {
    const analysis = analyzeHtml(
      page('<script type="application/ld+json">{"@type": "Article",}</script>'),
      URL,
      200,
      100,
    );
    expect(analysis.hasStructuredData).toBe(true);
    expect(analysis.structuredData?.errorCount).toBe(1);
    expect(analysis.structuredData?.blockCount).toBe(1);
  });

  it("caps the messages it carries into the issue detail", () => {
    const analysis = analyzeHtml(
      page(
        jsonLd({
          "@context": "https://schema.org",
          "@type": "Article",
          alpha: 1,
          bravo: 2,
          charlie: 3,
          delta: 4,
          echo: 5,
          foxtrot: 6,
          golf: 7,
        }),
      ),
      URL,
      200,
      100,
    );
    expect(analysis.structuredData?.errorCount).toBe(7);
    expect(analysis.structuredData?.errorMessages).toHaveLength(5);
  });
});
