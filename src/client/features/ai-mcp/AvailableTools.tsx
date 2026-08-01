type McpTool = {
  name: string;
  title: string;
  description: string;
};

type ToolCategory = {
  label: string;
  tools: McpTool[];
};

const toolCategories: ToolCategory[] = [
  {
    label: "Keywords",
    tools: [
      {
        name: "research_keywords",
        title: "Research keywords",
        description: "Get keyword ideas with volume, difficulty, and CPC.",
      },
      {
        name: "get_rank_tracker",
        title: "Get rank tracking positions",
        description: "Read tracked keyword positions.",
      },
      {
        name: "get_keyword_metrics",
        title: "Get keyword metrics",
        description:
          "Volume, difficulty, intent, CPC, and trends for any keyword list.",
      },
      {
        name: "list_saved_keywords",
        title: "Get saved keywords",
        description: "Pull your saved keyword lists.",
      },
      {
        name: "save_keywords",
        title: "Save keywords",
        description: "Save keywords back to OpenSEO.",
      },
    ],
  },
  {
    label: "Competitive Research",
    tools: [
      {
        name: "get_serp_results",
        title: "Get SERP results",
        description: "See live Google results for a keyword.",
      },
      {
        name: "find_serp_competitors",
        title: "Find SERP competitors",
        description: "Compare domains across a keyword set.",
      },
      {
        name: "get_ranked_keywords",
        title: "Get ranked keywords",
        description: "Find exact keyword, page, and rank rows.",
      },
      {
        name: "get_domain_overview",
        title: "Get domain overview",
        description: "Summarize a domain's organic footprint.",
      },
      {
        name: "get_domain_keyword_suggestions",
        title: "Get domain keywords",
        description: "Find keywords a domain already ranks for.",
      },
      {
        name: "get_backlinks_overview",
        title: "Get backlinks overview",
        description: "Check backlink and referring-domain stats.",
      },
      {
        name: "get_backlinks_profile",
        title: "Get backlinks profile",
        description: "Fetch paginated link-level backlink rows.",
      },
    ],
  },
  {
    label: "Local Business",
    tools: [
      {
        name: "search_local_businesses",
        title: "Search local businesses",
        description: "Find local business candidates near a coordinate.",
      },
      {
        name: "get_local_serp_results",
        title: "Get local SERP results",
        description: "Fetch one Maps or Local Finder result set.",
      },
      {
        name: "get_google_business_questions",
        title: "Get business questions",
        description: "Read Google Business Profile Q&A rows.",
      },
    ],
  },
  {
    label: "Search Console",
    tools: [
      {
        name: "get_search_console_performance",
        title: "Get Search Console performance",
        description:
          "Read clicks, impressions, CTR, and position from Search Console.",
      },
      {
        name: "inspect_urls",
        title: "Inspect URLs",
        description:
          "Check index status, crawl, and canonical for up to 10 URLs.",
      },
    ],
  },
];

export function AvailableTools() {
  return (
    <div className="grid gap-x-8 gap-y-8 md:grid-cols-2">
      {toolCategories.map((cat) => (
        <div key={cat.label}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-base-content/50">
            {cat.label}
          </h3>
          <ul className="mt-3 space-y-3">
            {cat.tools.map((tool) => (
              <li key={tool.name} className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-base-content">
                  {tool.title}
                </span>
                <p className="text-xs text-base-content/60 leading-relaxed">
                  {tool.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
