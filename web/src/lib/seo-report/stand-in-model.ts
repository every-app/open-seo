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
    markdown: `# ${reportTitle(site)}

This is a stand-in report. Nothing was measured and nothing was spent.

## Keyword families

| Family | Lead keyword | Monthly searches | Page |
| --- | --- | --- | --- |
| Stand-in family | stand-in keyword | 1,200 (estimate) | to create |

## Pages to create or rework

1. **Stand-in page.** See [the home page](https://${site}/) for what exists today.

## Method

Stand-in data, written by the local development server.
`,
    headline: `A stand-in headline for ${site}: about 1,200 searches a month are within reach.`,
    takeaways: ["A stand-in finding, written without calling anything."],
    stats: [
      { label: "Keyword families", value: "4" },
      { label: "Monthly searches", value: "1,200" },
    ],
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
