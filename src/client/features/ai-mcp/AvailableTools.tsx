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
    label: "Project Context",
    tools: [
      {
        name: "get_project_context",
        title: "Get project context",
        description:
          "Read your project's goals, positioning, competitors, and key pages.",
      },
      {
        name: "update_project_context",
        title: "Update project context",
        description:
          "Save what an agent learned back to your shared project context.",
      },
    ],
  },
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
        name: "create_rank_tracker",
        title: "Create a rank tracker",
        description: "Configure a domain for rank tracking.",
      },
      {
        name: "add_rank_tracking_keywords",
        title: "Add tracked keywords",
        description: "Add keywords to an existing rank tracker.",
      },
      {
        name: "remove_rank_tracking_keywords",
        title: "Remove tracked keywords",
        description: "Stop tracking selected keyword IDs.",
      },
      {
        name: "estimate_rank_tracker_cost",
        title: "Estimate rank check cost",
        description: "Preview the cost of an explicit rank check.",
      },
      {
        name: "run_rank_tracker",
        title: "Run a rank check",
        description: "Check a tracker's current positions now.",
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
      {
        name: "get_business_profile",
        title: "Get business profile",
        description:
          "Audit a Google Business Profile's categories, rating, hours, and claim status.",
      },
      {
        name: "get_business_reviews",
        title: "Get business reviews",
        description:
          "Collect Google reviews, including owner replies and other-site sources.",
      },
      {
        name: "get_business_updates",
        title: "Get business updates",
        description: "Check posting activity on a Google Business Profile.",
      },
      {
        name: "list_business_categories",
        title: "List business categories",
        description: "Find valid Google Business category slugs.",
      },
      {
        name: "get_local_rank_grid",
        title: "Get local rank grid",
        description:
          "Check Google Maps rank at each point of a grid around a business.",
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
  {
    label: "Google Analytics",
    tools: [
      {
        name: "get_google_analytics_organic_overview",
        title: "Get organic overview",
        description:
          "Compare top-line organic performance with the previous period.",
      },
      {
        name: "get_google_analytics_organic_landing_pages",
        title: "Get organic landing pages",
        description:
          "Read organic sessions, engagement, key events, and revenue by landing page.",
      },
      {
        name: "get_google_analytics_page_performance",
        title: "Get page performance",
        description: "Read page views, users, engagement time, and key events.",
      },
      {
        name: "get_google_analytics_key_events",
        title: "Get key events",
        description: "Read key-event outcomes by event or landing page.",
      },
      {
        name: "get_search_opportunities",
        title: "Get search opportunities",
        description:
          "Join Search Console demand with Analytics outcomes to prioritize pages.",
      },
      {
        name: "get_google_analytics_traffic_acquisition",
        title: "Get traffic acquisition",
        description:
          "Compare channels, source/medium, or campaigns using session outcomes.",
      },
      {
        name: "get_google_analytics_measurement_health",
        title: "Check measurement health",
        description:
          "Inspect streams, enhanced measurement, key events, and custom definitions.",
      },
      {
        name: "get_google_analytics_ecommerce_performance",
        title: "Get ecommerce performance",
        description:
          "Read product-funnel or landing-page transaction performance.",
      },
      {
        name: "get_google_analytics_site_search",
        title: "Get site search",
        description: "Read measured internal search terms and outcomes.",
      },
      {
        name: "get_google_analytics_audience_breakdown",
        title: "Get audience breakdown",
        description:
          "Compare device, country, or new-versus-returning audiences.",
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
