import { describe, expect, it } from "vitest";
import {
  parseDataforseoAnswer,
  parseLlmResponseAnswer,
} from "./dataforseoEvidence";

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
        // LLM Scraper shape: no date, the excerpt is `description`, and the
        // same page can come back with a tracking parameter.
        search_results: [
          {
            type: "chatgpt_search_result",
            url: "https://eur-lex.europa.eu/eli/dir/2024/825",
            domain: "eur-lex.europa.eu",
            title: "Directive - EU - 2024/825 - EN - EUR-Lex",
            description: null,
          },
          {
            type: "chatgpt_search_result",
            url: "https://eur-lex.europa.eu/eli/dir/2024/825?_hsmi=404124545",
            title: "Directive - EU - 2024/825 - EN - EUR-Lex",
          },
          { url: "https://openseo.so/blog", description: "Open source SEO" },
        ],
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
      searchResults: [
        {
          url: "https://eur-lex.europa.eu/eli/dir/2024/825",
          domain: "eur-lex.europa.eu",
          snippet: null,
          publishedAt: null,
          position: 1,
        },
        {
          url: "https://openseo.so/blog",
          snippet: "Open source SEO",
          position: 2,
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

// Trimmed from live /llm_responses/live answers to "How do the EU EmpCo rules
// on green claims affect biodiversity and nature restoration claims?",
// captured 2026-11-02.
const liveResponses = {
  claude: {
    model_name: "claude-sonnet-5-5",
    items: [
      {
        type: "message",
        sections: [
          {
            type: "text",
            text: 'EmpCo bans generic claims such as "nature positive".',
            annotations: [
              {
                title:
                  "Regenerative agriculture claims could change under EmpCo",
                url: "https://www.foodnavigator.com/Article/2026/10/16/regenerative-agriculture-claims-could-change-under-empco/",
              },
            ],
          },
        ],
      },
    ],
    search_results: [
      {
        title: "What is the EmpCo Directive?",
        url: "https://www.myclimate.org/en/information/faq/faq-detail/what-is-the-empco-directive/",
        date: "2026-09-15 22:32:00 +00:00",
        snippet: null,
      },
      {
        title: "Regenerative agriculture claims could change under EmpCo",
        url: "https://www.foodnavigator.com/Article/2026/10/16/regenerative-agriculture-claims-could-change-under-empco/",
        date: "2026-10-16 22:32:00 +00:00",
        snippet: null,
      },
    ],
  },
  perplexity: {
    model_name: "sonar-reasoning-pro",
    items: [
      {
        type: "message",
        sections: [
          {
            type: "text",
            text: "Directive (EU) 2024/825 prohibits generic environmental claims.",
            annotations: [
              {
                title: "Directive - EU - 2024/825 - EN",
                url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex:32024L0825",
              },
            ],
          },
        ],
      },
    ],
    search_results: [
      {
        title: "Directive - EU - 2024/825 - EN",
        url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex:32024L0825",
        date: "2025-03-11 00:00:00 +00:00",
        snippet:
          "Examples of generic environmental claims include ‘environmentally friendly’, ‘eco-friendly’, ‘green’, ‘nature’s friend’.",
      },
    ],
  },
  chat_gpt: {
    model_name: "gpt-5.6-terra",
    items: [
      {
        type: "message",
        sections: [
          {
            type: "text",
            text: "The directive applies from 27 September 2026.",
            annotations: [
              {
                title: "Directive - EU - 2024/825 - EN - EUR-Lex",
                url: "https://eur-lex.europa.eu/eli/dir/2024/825?utm_source=openai",
              },
            ],
          },
        ],
      },
    ],
    search_results: [
      {
        title: "Directive - EU - 2024/825 - EN - EUR-Lex",
        url: "https://eur-lex.europa.eu/eli/dir/2024/825",
        date: null,
        snippet:
          "\uE200cite\uE202turn611770search0\uE201 [wordlim: 200] Published: 2.7 years ago; Crawled: last month",
      },
      {
        title: "The EU #NatureRestoration Law",
        url: "https://environment.ec.europa.eu/topics/nature-and-biodiversity/nature-restoration-regulation_en",
        date: null,
        snippet: "x".repeat(800),
      },
    ],
  },
};

describe("LLM Responses evidence", () => {
  it("keeps the pages Claude found while searching, cited or not", () => {
    const answer = parseLlmResponseAnswer(liveResponses.claude);
    expect(answer.citations.map((c) => c.domain)).toEqual([
      "www.foodnavigator.com",
    ]);
    expect(answer.searchResults).toMatchObject([
      {
        domain: "www.myclimate.org",
        title: "What is the EmpCo Directive?",
        snippet: null,
        publishedAt: "2026-09-15T22:32:00.000Z",
        position: 1,
      },
      { domain: "www.foodnavigator.com", position: 2 },
    ]);
  });

  it("keeps Perplexity's search snippets", () => {
    const [result] = parseLlmResponseAnswer(
      liveResponses.perplexity,
    ).searchResults;
    expect(result).toMatchObject({
      url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex:32024L0825",
      publishedAt: "2025-03-11T00:00:00.000Z",
    });
    expect(result?.snippet).toMatch(/^Examples of generic environmental/);
  });

  it("strips ChatGPT's citation markers and caps long snippets", () => {
    const answer = parseLlmResponseAnswer(liveResponses.chat_gpt);
    // The cited URL carries utm_source=openai; normalized, it matches the result.
    expect(answer.citations[0]?.url).toBe(answer.searchResults[0]?.url);
    expect(answer.searchResults.map((r) => r.snippet)).toEqual([
      "Published: 2.7 years ago; Crawled: last month",
      `${"x".repeat(499)}…`,
    ]);
  });
});
