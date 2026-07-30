import { describe, expect, it } from "vitest";
import { analyzeHtml } from "./contentAnalyzer";

const SAMPLE_HTML = `
<html>
  <head>
    <title>A Short Test Title</title>
    <meta name="description" content="A short test description." />
  </head>
  <body>
    <h1>Main Heading About Widgets</h1>
    <h2>Sub Heading</h2>
    <h2>Another Sub Heading</h2>
    <p>Widgets are great. This page is about widgets. Widgets solve problems simply.</p>
    <img src="a.jpg" alt="A widget" />
    <img src="b.jpg" />
    <a href="/internal-page">Internal link</a>
    <a href="https://external.example.com/page">External link</a>
  </body>
</html>
`;

describe("analyzeHtml", () => {
  it("extracts title and meta description", () => {
    const result = analyzeHtml(SAMPLE_HTML, {
      url: "https://example.com/page",
    });
    expect(result.title).toBe("A Short Test Title");
    expect(result.metaDescription).toBe("A short test description.");
  });

  it("counts headings correctly", () => {
    const result = analyzeHtml(SAMPLE_HTML, {
      url: "https://example.com/page",
    });
    expect(result.headingCounts).toEqual({ h1: 1, h2: 2, h3: 0 });
    expect(result.h1Text).toEqual(["Main Heading About Widgets"]);
  });

  it("flags images missing alt text", () => {
    const result = analyzeHtml(SAMPLE_HTML, {
      url: "https://example.com/page",
    });
    expect(result.imageCount).toBe(2);
    expect(result.imagesMissingAlt).toBe(1);
  });

  it("splits internal and external links by host", () => {
    const result = analyzeHtml(SAMPLE_HTML, {
      url: "https://example.com/page",
    });
    expect(result.internalLinkCount).toBe(1);
    expect(result.externalLinkCount).toBe(1);
  });

  it("detects target keyword placement and density", () => {
    const result = analyzeHtml(SAMPLE_HTML, {
      url: "https://example.com/page",
      targetKeyword: "widgets",
    });
    expect(result.targetKeyword?.inTitle).toBe(false);
    expect(result.targetKeyword?.inH1).toBe(true);
    expect(result.targetKeyword?.inFirstParagraph).toBe(true);
    expect(result.targetKeyword?.occurrences).toBeGreaterThan(0);
  });

  it("returns null targetKeyword when none is given", () => {
    const result = analyzeHtml(SAMPLE_HTML, {
      url: "https://example.com/page",
    });
    expect(result.targetKeyword).toBeNull();
  });
});
