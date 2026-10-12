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

  it("reads every Google AI Overview reference as a citation", () => {
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
      "google_ai_overview",
    );
    expect(result?.answerText).toBe("Use SerpBear.");
    expect(result?.citations.map((citation) => citation.domain)).toEqual([
      "ccbd.dev",
      "matomo.org",
    ]);
  });

  it("treats a results page without an AI Overview as no answer", () => {
    expect(
      parseDataforseoAnswer(
        { items: [{ type: "organic", url: "https://openseo.so/" }] },
        "google_ai_overview",
      ),
    ).toMatchObject({ answerMarkdown: null, citations: [] });
  });
});
