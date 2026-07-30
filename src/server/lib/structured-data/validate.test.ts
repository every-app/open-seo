/* eslint-disable max-lines */
import { describe, expect, it } from "vitest";
import { validateHtml, validateJsonLdText, validateMarkup } from "./validate";
import type { Finding, FindingCode, ValidationResult } from "./types";

function codes(result: ValidationResult): FindingCode[] {
  return result.findings.map((finding) => finding.code);
}

function find(
  result: ValidationResult,
  code: FindingCode,
): Finding | undefined {
  return result.findings.find((finding) => finding.code === code);
}

const ARTICLE = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "How we cut audit runtime in half",
  image: "https://example.com/hero.jpg",
  datePublished: "2026-07-30",
  dateModified: "2026-07-30T09:15:00+10:00",
  author: {
    "@type": "Person",
    name: "Jane Doe",
    url: "https://example.com/authors/jane",
  },
};

describe("parse layer", () => {
  it("accepts complete Article markup without errors", () => {
    const result = validateJsonLdText(JSON.stringify(ARTICLE));
    expect(result.errorCount).toBe(0);
    expect(result.types).toContain("Article");
    expect(result.features.map((f) => f.feature)).toContain("Article");
    expect(result.features[0]?.eligible).toBe(true);
  });

  it("reports unparseable JSON as an error and stops there", () => {
    const result = validateJsonLdText('{"@type": "Article",}');
    expect(codes(result)).toEqual(["invalid-json"]);
    expect(result.errorCount).toBe(1);
    expect(find(result, "invalid-json")?.message).toMatch(/not valid json/i);
  });

  it("flags an empty script without crashing", () => {
    const result = validateJsonLdText("   ");
    expect(codes(result)).toEqual(["empty-script"]);
  });

  it("unwraps CDATA and HTML comment wrappers", () => {
    const result = validateJsonLdText(
      `//<![CDATA[\n${JSON.stringify(ARTICLE)}\n//]]>`,
    );
    expect(result.errorCount).toBe(0);
    expect(result.nodeCount).toBeGreaterThan(0);
  });

  it("unwraps @graph and top-level arrays", () => {
    const graph = {
      "@context": "https://schema.org",
      "@graph": [ARTICLE, { "@type": "WebSite", name: "Example" }],
    };
    const result = validateJsonLdText(JSON.stringify(graph));
    expect(result.errorCount).toBe(0);
    expect(result.types).toEqual(
      expect.arrayContaining(["Article", "Person", "WebSite"]),
    );
  });

  it("skips vocabularies it cannot judge", () => {
    const result = validateJsonLdText(
      JSON.stringify({ "@context": "https://example.org/ns", "@type": "Wat" }),
    );
    expect(codes(result)).toEqual(["foreign-context"]);
    expect(result.errorCount).toBe(0);
  });

  it("warns when @context is absent", () => {
    const { "@context": _context, ...rest } = ARTICLE;
    const result = validateJsonLdText(JSON.stringify(rest));
    expect(codes(result)).toContain("missing-context");
  });
});

describe("vocabulary layer", () => {
  it("rejects a misspelled type", () => {
    const result = validateJsonLdText(
      JSON.stringify({ "@context": "https://schema.org", "@type": "Recipie" }),
    );
    expect(codes(result)).toContain("unknown-type");
    expect(find(result, "unknown-type")?.severity).toBe("error");
  });

  it("rejects a misspelled property", () => {
    const result = validateJsonLdText(
      JSON.stringify({ ...ARTICLE, headlien: "Typo" }),
    );
    const finding = find(result, "unknown-property");
    expect(finding?.severity).toBe("error");
    expect(finding?.property).toBe("headlien");
  });

  it("does not mistake Object.prototype members for vocabulary terms", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "toString",
        constructor: "nope",
      }),
    );
    expect(codes(result)).toContain("unknown-type");
    expect(codes(result)).toContain("unknown-property");
  });

  it("warns when a real property is not declared on the type", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Person",
        name: "Jane",
        recipeYield: "4 servings",
      }),
    );
    const finding = find(result, "property-not-on-type");
    expect(finding?.severity).toBe("warning");
    expect(finding?.property).toBe("recipeYield");
  });

  it("warns on superseded terms", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Movie",
        name: "Example",
        actors: { "@type": "Person", name: "Jane" },
      }),
    );
    const finding = find(result, "superseded-term");
    expect(finding?.message).toContain('superseded by "actor"');
  });

  it("rejects a date that is not ISO 8601", () => {
    const result = validateJsonLdText(
      JSON.stringify({ ...ARTICLE, datePublished: "yesterday" }),
    );
    const finding = find(result, "invalid-literal");
    expect(finding?.severity).toBe("error");
    expect(finding?.property).toBe("datePublished");
  });

  it("accepts a date-only and a full timestamp", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        ...ARTICLE,
        datePublished: "2026-07-30",
        dateModified: "2026-07-30T09:15:00Z",
      }),
    );
    expect(codes(result)).not.toContain("invalid-literal");
  });

  it("rejects a relative URL where an absolute one is required", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: "Clip",
        uploadDate: "2026-07-30",
        thumbnailUrl: "/img/thumb.jpg",
      }),
    );
    const finding = find(result, "invalid-literal");
    expect(finding?.property).toBe("thumbnailUrl");
    expect(finding?.message).toMatch(/absolute http/);
  });

  it("rejects an enumeration value that is not a member", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Offer",
        price: "19.99",
        priceCurrency: "AUD",
        availability: "in stock",
      }),
    );
    const finding = find(result, "invalid-enum-value");
    expect(finding?.severity).toBe("error");
    expect(finding?.message).toContain("InStock");
  });

  it("accepts an enumeration member in bare and URL form", () => {
    for (const availability of ["InStock", "https://schema.org/InStock"]) {
      const result = validateJsonLdText(
        JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Offer",
          price: 19.99,
          availability,
        }),
      );
      expect(codes(result)).not.toContain("invalid-enum-value");
    }
  });

  it("warns when a nested entity is given as a bare string", () => {
    const result = validateJsonLdText(
      JSON.stringify({ ...ARTICLE, publisher: "Example Media" }),
    );
    const finding = find(result, "range-mismatch");
    expect(finding?.severity).toBe("warning");
    expect(finding?.property).toBe("publisher");
  });

  it("warns when the nested object is the wrong type", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        ...ARTICLE,
        author: { "@type": "Recipe", name: "Not a person" },
      }),
    );
    expect(find(result, "range-mismatch")?.message).toContain("author");
  });

  it("accepts a breadcrumb item given as an absolute URL", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Books",
            item: "https://example.com/books",
          },
          { "@type": "ListItem", position: 2, name: "Fiction" },
        ],
      }),
    );
    expect(codes(result)).not.toContain("range-mismatch");
  });

  it("still warns when a bare string is not a URL reference", () => {
    const result = validateJsonLdText(
      JSON.stringify({ ...ARTICLE, publisher: "Example Media" }),
    );
    expect(find(result, "range-mismatch")?.property).toBe("publisher");
  });

  it("leaves @id references alone", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Article", headline: "Hi", author: { "@id": "#jane" } },
          { "@type": "Person", "@id": "#jane", name: "Jane" },
        ],
      }),
    );
    expect(codes(result)).not.toContain("missing-type");
    expect(codes(result)).not.toContain("range-mismatch");
  });

  it("flags an entity with no @type", () => {
    const result = validateJsonLdText(
      JSON.stringify({ "@context": "https://schema.org", name: "Orphan" }),
    );
    expect(codes(result)).toContain("missing-type");
  });
});

describe("notCheckedTypes", () => {
  it("names types no rich-result rule covered", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Person", name: "Jane" },
          { "@type": "WebSite", name: "Site", url: "https://example.com" },
        ],
      }),
    );
    expect(result.notCheckedTypes).toEqual(["Person", "WebSite"]);
  });

  it("counts a type as checked when its feature matched under another name", () => {
    // A Restaurant matches the "Local business" feature; neither label should
    // then be reported as unchecked.
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Restaurant",
        name: "Cafe",
      }),
    );
    expect(result.notCheckedTypes).toEqual([]);
  });

  it("ignores nested types that were never candidates for a verdict", () => {
    // ListItem only ever appears inside itemListElement, so Google rules are
    // never applied to it. Listing it would dilute the types that genuinely
    // went unchecked.
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Tools",
                item: "https://example.com/tools",
              },
            ],
          },
          { "@type": "SoftwareApplication", name: "App" },
        ],
      }),
    );
    expect(result.types).toContain("ListItem");
    expect(result.notCheckedTypes).toEqual(["SoftwareApplication"]);
  });
});

describe("google layer", () => {
  it("reports a missing required property", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Pavlova",
      }),
    );
    const finding = find(result, "missing-required-property");
    expect(finding?.severity).toBe("error");
    expect(finding?.property).toBe("image");
    expect(finding?.feature).toBe("Recipe");
    expect(finding?.docsUrl).toContain("structured-data/recipe");
    expect(result.features[0]?.eligible).toBe(false);
  });

  it("requires one of review, aggregateRating, or offers on Product", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: "Widget",
      }),
    );
    expect(codes(result)).toContain("missing-one-of-required");
    expect(result.features[0]?.eligible).toBe(false);
  });

  it("requires a price once offers is present", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: "Widget",
        offers: { "@type": "Offer", priceCurrency: "AUD" },
      }),
    );
    const finding = find(result, "missing-required-property");
    expect(finding?.message).toMatch(/offers.*price/);
  });

  it("accepts AggregateOffer lowPrice in place of price", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: "Widget",
        offers: {
          "@type": "AggregateOffer",
          lowPrice: 10,
          priceCurrency: "AUD",
        },
      }),
    );
    expect(codes(result)).not.toContain("missing-required-property");
    expect(result.features[0]?.eligible).toBe(true);
  });

  it("does not double-report a missing nested requirement", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Event",
        name: "Launch",
        startDate: "2026-08-01T18:00:00+10:00",
      }),
    );
    const missing = result.findings
      .filter((f) => f.code === "missing-required-property")
      .map((f) => f.property);
    expect(missing).toEqual(["location"]);
  });

  it("aggregates missing recommended properties into one warning", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Bare",
      }),
    );
    const warnings = result.findings.filter(
      (f) => f.code === "missing-recommended-properties",
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("author");
    expect(result.features[0]?.missingRecommended).toContain("datePublished");
    expect(result.features[0]?.eligible).toBe(true);
  });

  it("picks the most specific rule for a subtype", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Restaurant",
        name: "Cafe",
      }),
    );
    expect(result.features[0]?.feature).toBe("Local business");
    expect(result.features[0]?.missingRequired).toEqual(["address"]);
  });

  it("uses the Article rule for NewsArticle", () => {
    const result = validateJsonLdText(
      JSON.stringify({ ...ARTICLE, "@type": "NewsArticle" }),
    );
    expect(result.features[0]?.feature).toBe("Article");
  });

  it("requires item on every breadcrumb except the last", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home" },
          { "@type": "ListItem", position: 2, name: "Current" },
        ],
      }),
    );
    const missing = result.findings.filter(
      (f) => f.code === "missing-required-property",
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]?.message).toContain("item");
    expect(missing[0]?.path).toBe("/itemListElement/0");
  });

  it("passes a complete breadcrumb trail", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://example.com/",
          },
          { "@type": "ListItem", position: 2, name: "Guides" },
        ],
      }),
    );
    expect(result.errorCount).toBe(0);
    expect(result.features[0]?.eligible).toBe(true);
  });

  it("does not report How-to retirement for a Recipe", () => {
    // Recipe is a subclass of HowTo in Schema.org, and Recipe rich results are
    // alive: matching subtypes flagged every recipe on the internet.
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Pavlova",
        image: "https://example.com/pavlova.jpg",
      }),
    );
    expect(codes(result)).not.toContain("retired-feature");
  });

  it("still reports How-to retirement for an actual HowTo", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "Change a tyre",
      }),
    );
    expect(find(result, "retired-feature")?.feature).toBe("How-to");
  });

  it("reports retired features as info, not failure", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Is this still a rich result?",
            acceptedAnswer: { "@type": "Answer", text: "No." },
          },
        ],
      }),
    );
    const finding = find(result, "retired-feature");
    expect(finding?.severity).toBe("info");
    expect(finding?.feature).toBe("FAQ");
    expect(result.errorCount).toBe(0);
  });
});

// Each of these came from running the validator over live pages (BBC, NYT)
// and finding it wrong about correct markup.
describe("false positives found against real pages", () => {
  it("accepts unit-bearing quantity values", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Banana bread",
        image: "https://example.com/loaf.jpg",
        nutrition: {
          "@type": "NutritionInformation",
          calories: "334kcal",
          proteinContent: "5g",
        },
      }),
    );
    expect(codes(result)).not.toContain("invalid-literal");
  });

  it("still rejects a quantity with no number in it", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "NutritionInformation",
        calories: "loads",
      }),
    );
    expect(find(result, "invalid-literal")?.property).toBe("calories");
  });

  it("accepts an enumeration member when the range also allows a class", () => {
    // suitableForDiet is `Diet` or the `RestrictedDiet` enumeration.
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Salad",
        image: "https://example.com/salad.jpg",
        suitableForDiet: "https://schema.org/VegetarianDiet",
      }),
    );
    expect(codes(result)).not.toContain("range-mismatch");
    expect(codes(result)).not.toContain("invalid-enum-value");
  });

  it("ignores query-input from Google's sitelinks searchbox pattern", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        url: "https://example.com/",
        potentialAction: {
          "@type": "SearchAction",
          target: "https://example.com/search?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      }),
    );
    expect(codes(result)).not.toContain("unknown-property");
  });

  it("does not push recommended-property warnings onto nested references", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Home",
        publisher: { "@type": "Organization", name: "Example Media" },
      }),
    );
    expect(codes(result)).not.toContain("missing-recommended-properties");
  });

  it("still reports required properties on nested entities", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Home",
        about: { "@type": "Recipe", name: "No image here" },
      }),
    );
    const finding = find(result, "missing-required-property");
    expect(finding?.property).toBe("image");
    expect(finding?.path).toBe("/about");
  });

  it("evaluates the page's main entity as a primary one", () => {
    const result = validateJsonLdText(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Recipe page",
        mainEntity: {
          "@type": "Recipe",
          name: "Pavlova",
          image: "https://example.com/p.jpg",
        },
      }),
    );
    expect(result.features.map((f) => f.feature)).toEqual(["Recipe"]);
    expect(codes(result)).toContain("missing-recommended-properties");
  });
});

describe("html extraction", () => {
  const html = `<!doctype html><html><head>
    <script type="application/ld+json;charset=utf-8">${JSON.stringify(ARTICLE)}</script>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList"}</script>
    <script type="application/json">{"not":"jsonld"}</script>
  </head><body>hi</body></html>`;

  it("finds every ld+json block, including charset-suffixed types", async () => {
    const result = await validateHtml(html);
    expect(result.scriptCount).toBe(2);
    expect(result.types).toEqual(
      expect.arrayContaining(["Article", "BreadcrumbList"]),
    );
  });

  it("attributes findings to the script they came from", async () => {
    const result = await validateHtml(html);
    const breadcrumbFinding = result.findings.find(
      (f) => f.code === "missing-required-property",
    );
    expect(breadcrumbFinding?.scriptIndex).toBe(1);
    expect(breadcrumbFinding?.property).toBe("itemListElement");
  });

  it("routes snippets and documents through validateMarkup", async () => {
    expect((await validateMarkup(JSON.stringify(ARTICLE))).scriptCount).toBe(1);
    expect((await validateMarkup(html)).scriptCount).toBe(2);
  });
});
