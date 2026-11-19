import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { normalizeDomain } from "@/lib/free-tools/server";
import { STOP_REASONS } from "./failure";
import { REPORT_LIMITS } from "./limits";
import { readPage, type RobotsCache } from "./read-page";
import {
  domainKeywords,
  domainOverview,
  keywordIdeas,
  keywordMetrics,
  searchResults,
} from "./research";

// Everything the model can do while it writes a report: five research
// lookups, reading a page of the site, and handing the report in. Each has a
// count it can't pass and a size it can't raise, kept here where nothing a
// page says to the model can change them. They are what bounds a report's
// search-data bill (free-tools/spend.ts reserves for the worst case).

/** How many times a report may call each tool, and the most each call may ask for. */
export const TOOL_LIMITS = {
  get_domain_overview: { calls: 1 },
  get_domain_keyword_suggestions: { calls: 1 },
  get_keyword_metrics: { calls: 3, keywords: 60 },
  research_keywords: { calls: 1, seeds: 4 },
  get_serp_results: { calls: 3, keywords: 5 },
  read_page: { calls: REPORT_LIMITS.pages },
} as const;
type ToolName = keyof typeof TOOL_LIMITS;

export const SUBMIT_TOOL = "submit_report";
const MAX_RESULT_CHARACTERS = 60_000;
const MAX_KEYWORD_CHARACTERS = 80;
const MAX_REPORT_CHARACTERS = 60_000;

// DataForSEO charges five times as much for a results page whose keyword
// holds one of Google's search operators. These are the sixteen it names.
const SEARCH_OPERATOR =
  /\b(allinanchor|allintext|allintitle|allinurl|cache|define|definition|filetype|id|inanchor|info|intext|intitle|inurl|link|site):/i;

/**
 * What the model hands in. Anything that doesn't fit is a failed report, and
 * so is a "blocked" hand-in with no listed reason or a "done" one with a
 * reason (write.ts).
 */
export const submissionSchema = z.strictObject({
  status: z.enum(["done", "blocked"]),
  reason: z
    .enum(STOP_REASONS)
    .nullable()
    .describe(
      'Why you stopped, when status is "blocked": closed, moved, not_united_states, or failed when the research tools failed. Null when status is "done".',
    ),
  headline: z.string().max(400),
  takeaways: z.array(z.string().max(400)).max(4),
  stats: z
    .array(
      z.strictObject({ label: z.string().max(60), value: z.string().max(60) }),
    )
    .max(6),
  markdown: z.string().max(MAX_REPORT_CHARACTERS),
});
export type Submission = z.infer<typeof submissionSchema>;

/** One report being written: its site, what it has used, and what it has seen. */
export interface Run {
  /** The site the report is about. Pages are read from it and nowhere else. */
  site: string;
  /** How many times each tool has been called. */
  calls: Partial<Record<ToolName, number>>;
  /** Sites named on the results pages it checked, which the report may link to. */
  hosts: Set<string>;
  robots: RobotsCache;
  /** What DataForSEO has charged this report. */
  dataUsd: number;
}
export const newRun = (site: string): Run => ({
  site,
  calls: {},
  hosts: new Set(),
  robots: new Map(),
  dataUsd: 0,
});

/** Counts a call, or answers false when the tool has had all it may. */
function spend(run: Run, name: ToolName) {
  const used = run.calls[name] ?? 0;
  if (used >= TOOL_LIMITS[name].calls) return false;
  run.calls[name] = used + 1;
  return true;
}

const phrases = (values: string[], most: number) =>
  values
    .map((value) => value.trim().slice(0, MAX_KEYWORD_CHARACTERS))
    .filter(Boolean)
    .slice(0, most);

/**
 * `apiKey` is DataForSEO's. Without one (the local stand-in, whose model
 * calls nothing) the research tools are left out.
 */
export function reportTools(apiKey: string | null, run: Run): ToolSet {
  /** A tool that answers with text, held to its call count and a readable size. */
  const limited = <Input>(
    name: ToolName,
    description: string,
    inputSchema: z.ZodType<Input>,
    answer: (input: Input) => Promise<string>,
  ) =>
    tool({
      description,
      inputSchema,
      execute: async (input: Input) =>
        spend(run, name)
          ? (await answer(input)).slice(0, MAX_RESULT_CHARACTERS)
          : `Refused: this report has made all the ${name} calls it may. Finish with what you have.`,
    });
  const handIn: ToolSet = {
    read_page: limited(
      "read_page",
      "Read one page of the site as text, or its sitemap or feed as XML.",
      z.object({ url: z.string() }),
      ({ url }) => readPage(url, run),
    ),
    // No `execute`: calling it ends the run, and the caller reads its input.
    [SUBMIT_TOOL]: tool({
      description: "Hand in the finished report and its summary. Call once.",
      inputSchema: submissionSchema,
    }),
  };
  if (!apiKey) return handIn;

  const lookup = {
    apiKey,
    charge: (usd: number) => {
      run.dataUsd += usd;
    },
  };
  const domainInput = z.object({
    domain: z.string().describe("A domain, like example.com."),
  });
  const forDomain =
    (read: (domain: string) => Promise<string>) =>
    async ({ domain }: z.infer<typeof domainInput>) => {
      const name = normalizeDomain(domain);
      return name ? read(name) : "Refused: that is not a domain.";
    };

  return {
    ...handIn,
    get_domain_overview: limited(
      "get_domain_overview",
      "Estimate a website's monthly organic search traffic and how many keywords it ranks for.",
      domainInput,
      forDomain((domain) => domainOverview(lookup, domain)),
    ),
    get_domain_keyword_suggestions: limited(
      "get_domain_keyword_suggestions",
      "List the top 100 organic keywords a domain ranks for, with its position for each, most traffic first.",
      domainInput,
      forDomain((domain) => domainKeywords(lookup, domain)),
    ),
    get_keyword_metrics: limited(
      "get_keyword_metrics",
      `Get search volume, keyword difficulty, CPC and search intent for up to ${TOOL_LIMITS.get_keyword_metrics.keywords} keywords you already have. Keywords too rare to measure come back without a row.`,
      z.object({
        keywords: z.array(z.string()).min(1),
        includeMonthlyTrends: z.boolean().optional(),
      }),
      ({ keywords }) =>
        keywordMetrics(
          lookup,
          phrases(keywords, TOOL_LIMITS.get_keyword_metrics.keywords),
        ),
    ),
    research_keywords: limited(
      "research_keywords",
      `Find keyword ideas for up to ${TOOL_LIMITS.research_keywords.seeds} seeds in one call, each with volume, difficulty and intent. Use * in a seed as a wildcard for any word or words: "best * for dogs" returns only keywords matching that pattern. A wildcard needs at least one other word.`,
      z.object({ seeds: z.array(z.string()).min(1) }),
      ({ seeds }) =>
        keywordIdeas(
          lookup,
          phrases(seeds, TOOL_LIMITS.research_keywords.seeds),
        ),
    ),
    get_serp_results: limited(
      "get_serp_results",
      `Get page one of Google for up to ${TOOL_LIMITS.get_serp_results.keywords} keywords. Each is read 3 times and merged into one row per site: quote \`best position\` as a site's position, and treat a site seen in 1 read as weak evidence. Plain keywords only: one with a search operator such as site: is dropped.`,
      z.object({ keywords: z.array(z.string()).min(1) }),
      async ({ keywords }) => {
        const plain = phrases(
          keywords.filter((keyword) => !SEARCH_OPERATOR.test(keyword)),
          TOOL_LIMITS.get_serp_results.keywords,
        );
        if (!plain.length)
          return "Refused: search operators such as site: can't be used here. Ask with plain keywords.";
        const found = await searchResults(lookup, plain);
        for (const host of found.hosts) run.hosts.add(host);
        return found.text;
      },
    ),
  };
}
