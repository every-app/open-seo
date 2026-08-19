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
