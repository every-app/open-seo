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
        name: "get_serp_results",
        title: "Get SERP results",
        description: "See live Google results for a keyword.",
      },
      {
        name: "get_rank_tracker",
        title: "Get rank tracking positions",
        description: "Read tracked keyword positions.",
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
    label: "Domain",
    tools: [
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
