import { describe, expect, it } from "vitest";
import { parseDataforseoAnswer } from "./dataforseoEvidence";

describe("DataForSEO answer evidence", () => {
  it("keeps safe cited pages without tracking parameters and drops citation pills from prose", () => {
    const result = parseDataforseoAnswer(
      {
        datetime: "2026-09-30 18:41:09 +00:00",
        markdown:
          "- **OpenSEO** is open source. [openseo.so](https://openseo.so/blog?utm_source=chatgpt.com) See [SerpBear on GitHub](https://github.com/towfiqi/serpbear).",
        sources: [
          {
            url: "https://openseo.so/blog?utm_source=chatgpt.com",
            title: "Blog",
          },
          { url: "javascript:alert(1)" },
        ],
        search_results: [{ url: "https://example.com/retrieved" }],
      },
      "chatgpt",
    );
    expect(result).toMatchObject({
      answerText: "OpenSEO is open source.  See SerpBear on GitHub.",
      citations: [
        {
          url: "https://openseo.so/blog",
          domain: "openseo.so",
          title: "Blog",
          position: 1,
        },
      ],
      collectedAt: "2026-09-30T18:41:09.000Z",
    });
  });

  it("removes NUL characters, which Postgres text columns reject", () => {
    const result = parseDataforseoAnswer(
      {
        markdown: "Open\0SEO",
        sources: [{ url: "https://openseo.so/", title: "Open\0SEO" }],
      },
      "chatgpt",
    );
    expect(result).toMatchObject({
      answerMarkdown: "OpenSEO",
      citations: [{ title: "OpenSEO" }],
    });
  });

  // An AI Mode answer has the AI Overview's shape.
  it.each(["google_ai_overview", "google_ai_mode"] as const)(
    "reads every %s reference as a citation",
    (engine) => {
      const result = parseDataforseoAnswer(
        {
          items: [
            {
              type: "ai_overview",
              markdown: "Use SerpBear.[[1]](https://ccbd.dev/blog)",
              references: [{ url: "https://ccbd.dev/blog" }],
              items: [
                {
                  references: [{ url: "https://matomo.org/" }],
                  links: [{ url: "https://github.com/towfiqi/serpbear" }],
                },
              ],
            },
          ],
        },
        engine,
      );
      expect(result?.answerText).toBe("Use SerpBear.");
      expect(result?.citations.map((citation) => citation.domain)).toEqual([
        "ccbd.dev",
        "matomo.org",
      ]);
    },
  );

  it("names the product and store on each Google AI Mode product card", () => {
    const result = parseDataforseoAnswer(
      {
        items: [
          {
            type: "ai_overview",
            // The answer's own markdown has the card's text without the card.
            markdown: "### Top picks\n\n\n\n---\n\n- Steams milk.",
            items: [
              {
                type: "ai_overview_shopping",
                // The card's own name is HTML-escaped.
                markdown:
                  "---\n\n[![De&#39;Longhi Dedica](https://api.dataforseo.com/cdn/i/1)](https://www.google.com/search?ibp=oshop)\n\n- Steams milk.",
                items: [{ title: "De'Longhi Dedica", seller: "Best Buy" }],
              },
            ],
          },
        ],
      },
      "google_ai_mode",
    );
    expect(result?.answerText).toBe(
      "Top picks\n\n\n\n---\n\nDe'Longhi Dedica · Best Buy\n\nSteams milk.",
    );
  });

  it.each(["google_ai_overview", "google_ai_mode"] as const)(
    "cites a page a %s answer links to in its text",
    (engine) => {
      const result = parseDataforseoAnswer(
        {
          items: [
            {
              type: "ai_overview",
              markdown:
                "Buy it via [LovelySkin](https://www.lovelyskin.com/o/spf).[[1]](https://ccbd.dev/blog) ![Tube](https://cdn.example/tube.png) [Shop](https://www.google.com/search?ibp=oshop)",
              references: [{ url: "https://ccbd.dev/blog", title: "Guide" }],
            },
          ],
        },
        engine,
      );
      expect(result?.citations).toMatchObject([
        { domain: "ccbd.dev", title: "Guide" },
        { domain: "www.lovelyskin.com", title: null },
      ]);
    },
  );

  it("treats a results page without an AI Overview as no answer", () => {
    expect(
      parseDataforseoAnswer(
        { items: [{ type: "organic", url: "https://openseo.so/" }] },
        "google_ai_overview",
      ),
    ).toMatchObject({ answerMarkdown: null, citations: [] });
  });
});
