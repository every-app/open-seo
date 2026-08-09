import { describe, expect, it } from "vitest";
import {
  addJsonLdBlock,
  createJsonLdAccumulator,
  isUnlinkedJsonLdGraph,
  summarizeJsonLd,
} from "./jsonld";

function summarize(...blocks: string[]) {
  const acc = createJsonLdAccumulator();
  for (const block of blocks) addJsonLdBlock(acc, block);
  return summarizeJsonLd(acc);
}

function isUnlinked(...blocks: string[]) {
  return isUnlinkedJsonLdGraph(summarize(...blocks));
}

const ARTICLE = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Hello",
});
const ORGANIZATION = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Acme",
});

describe("summarizeJsonLd", () => {
  it("counts top-level entities across blocks", () => {
    expect(summarize(ARTICLE, ORGANIZATION)).toMatchObject({
      blocks: 2,
      nodes: 2,
      hasGraph: false,
      crossReferenced: false,
      invalidBlocks: 0,
    });
  });

  it("expands @graph and a top-level array into their entities", () => {
    expect(
      summarize(
        JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [{ "@type": "Article" }, { "@type": "Organization" }],
        }),
      ),
    ).toMatchObject({ blocks: 1, nodes: 2, hasGraph: true });

    expect(
      summarize(
        JSON.stringify([{ "@type": "Article" }, { "@type": "Person" }]),
      ),
    ).toMatchObject({ blocks: 1, nodes: 2, hasGraph: false });
  });

  it("separates declared @ids from references to them", () => {
    expect(
      summarize(
        JSON.stringify({
          "@type": "Article",
          "@id": "https://example.com/#article",
          author: { "@id": "https://example.com/#person" },
        }),
        JSON.stringify({
          "@type": "Person",
          "@id": "https://example.com/#person",
        }),
      ),
    ).toMatchObject({ nodes: 2, crossReferenced: true });
  });

  it("does not treat a dangling reference as a link", () => {
    expect(
      summarize(
        JSON.stringify({
          "@type": "Article",
          author: { "@id": "https://example.com/#nobody" },
        }),
        ORGANIZATION,
      ),
    ).toMatchObject({ crossReferenced: false });
  });

  it("counts malformed blocks without throwing", () => {
    expect(summarize("{ not json", ARTICLE)).toMatchObject({
      blocks: 2,
      invalidBlocks: 1,
      nodes: 1,
    });
  });

  it("marks oversized input as truncated instead of guessing", () => {
    const huge = JSON.stringify({
      "@type": "Product",
      description: "x".repeat(70_000),
    });
    expect(summarize(huge, ARTICLE)).toMatchObject({ truncated: true });
  });
});

describe("isUnlinkedJsonLdGraph", () => {
  it("does not fire on a page with no structured data", () => {
    expect(isUnlinked()).toBe(false);
  });

  it("does not fire on a single entity", () => {
    expect(isUnlinked(ARTICLE)).toBe(false);
  });

  it("fires on two independent entities in separate blocks", () => {
    expect(isUnlinked(ARTICLE, ORGANIZATION)).toBe(true);
  });

  it("fires on two independent entities in one array block", () => {
    expect(
      isUnlinked(
        JSON.stringify([{ "@type": "Article" }, { "@type": "Organization" }]),
      ),
    ).toBe(true);
  });

  it("does not fire when the entities share a @graph", () => {
    expect(
      isUnlinked(
        JSON.stringify({
          "@graph": [{ "@type": "Article" }, { "@type": "Organization" }],
        }),
      ),
    ).toBe(false);
  });

  it("does not fire when a resolvable @id links the blocks", () => {
    expect(
      isUnlinked(
        JSON.stringify({
          "@type": "Article",
          publisher: { "@id": "https://example.com/#org" },
        }),
        JSON.stringify({
          "@type": "Organization",
          "@id": "https://example.com/#org",
        }),
      ),
    ).toBe(false);
  });

  it("stays quiet when a cap hid part of the data", () => {
    const huge = JSON.stringify({
      "@type": "Product",
      description: "x".repeat(70_000),
    });
    expect(isUnlinked(huge, ARTICLE, ORGANIZATION)).toBe(false);
  });
});
