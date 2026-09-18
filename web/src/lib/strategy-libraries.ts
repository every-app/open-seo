export type StrategyLibraryItem = {
  title: string;
  description: string;
  href: string;
};

export const keywordResearchStrategies: StrategyLibraryItem[] = [
  {
    title: "Seed from conversation, not a volume report",
    description:
      "Harvest seed keywords from sales calls and support tickets using the language customers already use.",
    href: "/library/keyword-research/seed-from-conversation",
  },
  {
    title: "What are long-tail keywords, and how to mine them",
    description:
      "Find long-tail keywords in People Also Ask, autocomplete, and Search Console queries where your pages already rank.",
    href: "/library/keyword-research/long-tail-question-mining",
  },
  {
    title: "Search-intent mapping (hot / warm / cold)",
    description:
      "Sort keywords by buying temperature before you write, then build high-intent pages first.",
    href: "/library/keyword-research/search-intent-mapping",
  },
  {
    title: "Cluster keywords into topical hubs",
    description:
      "Group keywords by intent and build topical hubs without creating competing pages.",
    href: "/library/keyword-research/cluster-topical-hubs",
  },
  {
    title: "Programmatic discovery with Search Console",
    description:
      "Use MCP to find Search Console queries and pages with room to gain more clicks.",
    href: "/library/keyword-research/gsc-programmatic-discovery",
  },
  {
    title: "Opportunity sizing & forecasting",
    description:
      "Estimate a cluster's difficulty, traffic range, and payback scenarios before you invest.",
    href: "/library/keyword-research/opportunity-sizing-forecasting",
  },
  {
    title: "Intent beyond Google (Pinterest, AI, LinkedIn)",
    description: "Research demand on Pinterest, LinkedIn, and AI assistants.",
    href: "/library/keyword-research/intent-beyond-google",
  },
  {
    title: "Map positioning to real demand",
    description:
      "Check whether your category language matches the terms customers search for.",
    href: "/library/keyword-research/positioning-to-demand",
  },
];

export const COMPETITIVE_ANALYSIS_LIBRARY = {
  name: "Competitive Analysis",
  path: "/library/competitive-analysis",
};

export const competitiveAnalysisStrategies: StrategyLibraryItem[] = [
  {
    title: "Find out who your real competitors are",
    description:
      "The domains sharing your SERPs are rarely the companies on your battlecard. Compare a keyword set and read the list you actually compete against.",
    href: "/library/competitive-analysis/find-your-real-competitors",
  },
  {
    title: "Keyword gap analysis: subtract the brand terms first",
    description:
      "Most ranked-keyword lists are mostly brand. Strip brand from both sides and the gap becomes a short, buildable list.",
    href: "/library/competitive-analysis/keyword-gap-analysis",
  },
  {
    title: "How accurate are competitor traffic estimates?",
    description:
      "Read a domain overview without being fooled by close-variant stacking or a headline traffic number from another business line.",
    href: "/library/competitive-analysis/competitor-traffic-estimates",
  },
  {
    title: "Read a competitor's link profile before you copy it",
    description:
      "Referring domains, spam score, and broken links tell you whether an authority advantage is real or repeated.",
    href: "/library/competitive-analysis/backlink-gap-analysis",
  },
];

export const SITE_AUDIT_LIBRARY = {
  name: "Site Audit",
  path: "/library/site-audit",
};

export const siteAuditStrategies: StrategyLibraryItem[] = [
  {
    title: "The technical SEO audit checklist that ends in fixes",
    description:
      "One crawl returned 1,180 findings and 35 that mattered. Sort by severity, group by cause, and read the fix that ships with every issue.",
    href: "/library/site-audit/technical-seo-audit-checklist",
  },
  {
    title: "Write an audit report the client will actually act on",
    description:
      "A six-section structure that ties every finding to a page, a cost, and a business number, plus what to leave out.",
    href: "/library/site-audit/seo-audit-report-template",
  },
  {
    title: "Index bloat: when the fix is deleting pages",
    description:
      "Five million pages came out of one site and it recovered. On a small site the same instinct usually wastes a weekend. How to tell which you have.",
    href: "/library/site-audit/index-bloat",
  },
];

export const RANK_TRACKING_LIBRARY = {
  name: "Rank Tracking",
  path: "/library/rank-tracking",
};

export const rankTrackingStrategies: StrategyLibraryItem[] = [
  {
    title: "Which keywords to track, and how many",
    description:
      "Twenty to fifty terms from Search Console, tied to pages that earn money, priced before they go in. A 500-row tracker is a report nobody reads.",
    href: "/library/rank-tracking/which-keywords-to-track",
  },
  {
    title: "Is Search Console a rank tracker? Where the free data stops",
    description:
      "Search Console gives an average across searchers and devices, with preliminary recent data. Enough for many sites. How to tell whether yours needs more.",
    href: "/library/rank-tracking/search-console-vs-rank-tracker",
  },
  {
    title: "Local rank tracking: position depends on where the searcher stands",
    description:
      "Nine points three kilometres apart, four different businesses at number one. Why a local business needs a grid before a tracker.",
    href: "/library/rank-tracking/local-rank-tracking",
  },
  {
    title: "The keyword ranking report your CEO will read",
    description:
      "Lead with the business number, group movement into four counts, explain three rows, say what happens next. One page, every month.",
    href: "/library/rank-tracking/keyword-ranking-report",
  },
];

export const AI_AGENT_SEO_LIBRARY = {
  name: "AI-Agent SEO",
  path: "/library/ai-agent-seo",
};

export const aiAgentSeoStrategies: StrategyLibraryItem[] = [
  {
    title: "Run SEO from your AI assistant: the MCP workflow",
    description:
      "Connect one server and the assistant you already use can read Search Console, pull keyword data and check rankings in the same conversation. The first five prompts, and the row that shows why a human still reads the output.",
    href: "/library/ai-agent-seo/run-seo-from-your-ai-assistant",
  },
  {
    title: "What to automate and what to keep: the dispatcher rule",
    description:
      "A scheduled rank check runs without anyone watching. A decision about which keywords go in it does not. Three layers, not two.",
    href: "/library/ai-agent-seo/what-to-automate",
  },
  {
    title: "Human in the loop content: the brief is the job",
    description:
      "Most teams run the loop backwards. Humans write the brief, the model drafts, humans edit, and the two checks that catch the draft that reads like everyone else's.",
    href: "/library/ai-agent-seo/human-in-the-loop-content",
  },
  {
    title: "Skills, memory and the trace: make the good run repeatable",
    description:
      "Save the workflow as a skill, give the agent a memory it reads every run, make it write down every step. Plus the two checks that catch the confident wrong answer.",
    href: "/library/ai-agent-seo/skills-memory-and-the-trace",
  },
];
