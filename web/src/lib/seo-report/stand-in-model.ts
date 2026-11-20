import { MockLanguageModelV3 } from "ai/test";
import { ReportFailure } from "./failure";
import { reportTitle } from "./prompt";
import { SUBMIT_TOOL, type Submission } from "./tools";

// Local development only (see StandIn in config.ts): a model that calls
// nothing and costs nothing. It hands in a short made-up report at once, so
// every state of the flow can be seen. A site whose name starts with
// "blocked." gets no report, to show a failure with a reason.

const USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

export function standInModel(site: string) {
  const submission: Submission = {
    status: site.startsWith("blocked.") ? "blocked" : "done",
    reason: site.startsWith("blocked.") ? ReportFailure.NotUnitedStates : null,
    headline: `Start with a stand-in page for ${site}: about 1,200 searches a month and an open page one.`,
    standing: null,
    customer: "a stand-in, written without reading the site",
    moves: site.startsWith("blocked.")
      ? []
      : [
          {
            action: "Publish a stand-in page",
            page: null,
            keyword: "stand-in keyword",
            searches: 1200,
            difficulty: 20,
            holders: "Stand-in sites, with pages of no particular kind.",
            steps: ["Add a stand-in table.", "Work out a stand-in example."],
            why: "It is the only move a stand-in has.",
          },
        ],
    markdown: `# ${reportTitle(site)}

## Keywords for each page

| Page | Keyword | Searches a month (est.) | Difficulty (est.) |
| --- | --- | ---: | ---: |
| 1. Stand-in page | stand-in keyword | 1,200 | 20 |

## After the plan

- **another stand-in keyword**, 300 searches a month: see [the home page](https://${site}/) for what exists today.
`,
  };
  return new MockLanguageModelV3({
    doGenerate: {
      content: [
        {
          type: "tool-call",
          toolCallId: "stand-in",
          toolName: SUBMIT_TOOL,
          input: JSON.stringify(submission),
        },
      ],
      finishReason: { unified: "tool-calls", raw: undefined },
      usage: USAGE,
      warnings: [],
    },
  });
}
