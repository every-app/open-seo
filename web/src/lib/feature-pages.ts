import { FEATURE_PAGE_SLUGS } from "@/lib/feature-page-slugs";

export type FeaturePage = {
  slug: string;
  eyebrow: string;
  navDescription: string;
  title: string;
  description: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  imageAlt: string;
  imageSrc: string;
  workflows: Array<{
    title: string;
    description: string;
  }>;
  metrics: Array<{
    label: string;
    value: string;
  }>;
  showMetrics?: boolean;
  useCases: string[];
  differentiators: string[];
  related: Array<{
    label: string;
    href: string;
  }>;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
};

export const featurePages = {
  keywordResearch: {
    slug: FEATURE_PAGE_SLUGS.keywordResearch,
    eyebrow: "Keyword Research",
    navDescription: "Find keyword ideas and SERPs.",
    title: "Keyword research tool for practical SEO planning",
    description:
      "Find keyword ideas, compare search volume and difficulty, inspect SERP results, and save the opportunities worth building around.",
    primaryKeyword: "keyword research tool",
    secondaryKeywords: [
      "seo keyword research tool",
      "free keyword research tool",
      "keyword research tools",
    ],
    imageAlt: "OpenSEO keyword research dashboard",
    imageSrc:
      "https://imagedelivery.net/ysLOa6bzFaM49Jxok-TAlw/d77077d0-cdf4-4523-0c41-56a7b4861300/public",
    workflows: [
      {
        title: "Research seed topics",
        description:
          "Start with one or more seeds and expand them into keyword ideas with volume, difficulty, CPC, and intent signals.",
      },
      {
        title: "Inspect the real SERP",
        description:
          "Open SERP results beside keyword metrics so content decisions are based on the pages ranking for that query.",
      },
      {
        title: "Save and organize opportunities",
        description:
          "Keep useful keywords in your workspace and tag them for content planning, rank tracking, or AI-agent workflows.",
      },
    ],
    metrics: [
      { label: "Search volume", value: "Demand" },
      { label: "Keyword difficulty", value: "Competition" },
      { label: "CPC", value: "Commercial signal" },
      { label: "SERP results", value: "Search context" },
    ],
    showMetrics: true,
    useCases: [
      "Build a content roadmap from real keyword data.",
      "Find lower-competition variants before writing.",
      "Group keywords for articles, landing pages, and rank tracking.",
    ],
    differentiators: [
      "Open-source SEO workflows you can self-host or run in the managed app.",
      "DataForSEO-backed metrics without locking the research process into a black box.",
      "MCP access so AI agents can research and save keywords for you.",
    ],
    related: [
      { label: "Keyword Clustering", href: "/docs/skills/keyword-clustering" },
      {
        label: "Keyword Research",
        href: "/docs/skills/keyword-research",
      },
      { label: "Rank Tracking", href: "/features/rank-tracking" },
    ],
    faqs: [
      {
        question: "What is OpenSEO keyword research best for?",
        answer:
          "OpenSEO is best for finding SEO keyword ideas, checking demand and difficulty, and turning those ideas into saved keywords you can revisit.",
      },
      {
        question: "Can I use OpenSEO as a free keyword research tool?",
        answer:
          "OpenSEO is open source and can be self-hosted. The managed app also keeps keyword research tied to transparent usage instead of a large fixed subscription to a closed SEO suite.",
      },
      {
        question: "Does OpenSEO show live search results?",
        answer:
          "Yes. Keyword research can be paired with SERP inspection so you can see ranking pages alongside the metrics.",
      },
    ],
  },
  siteAudit: {
    slug: FEATURE_PAGE_SLUGS.siteAudit,
    eyebrow: "Site Audit",
    navDescription: "Audit page-level SEO signals.",
    title: "SEO audit tool for finding technical issues fast",
    description:
      "Crawl a site, collect page-level technical signals, and optionally run Lighthouse checks for performance, SEO, accessibility, and best-practice issues.",
    primaryKeyword: "seo audit tool",
    secondaryKeywords: [
      "seo site audit",
      "free seo audit tool",
      "seo audit tools",
    ],
    imageAlt: "OpenSEO site audit report",
    imageSrc:
      "https://imagedelivery.net/ysLOa6bzFaM49Jxok-TAlw/53149e87-0027-4fa8-5d13-bcaab60c7100/public",
    workflows: [
      {
        title: "Run a site crawl",
        description:
          "Inspect pages for status codes, titles, meta descriptions, headings, indexability signals, image alt coverage, links, response time, and optional Lighthouse findings.",
      },
      {
        title: "Prioritize issues",
        description:
          "Review crawled pages and optional Lighthouse results so the team can focus on visible page and performance problems.",
      },
      {
        title: "Drill into affected URLs",
        description:
          "Move into URLs with missing titles, metadata, heading and image-alt signals, status-code issues, response-time data, or optional Lighthouse findings.",
      },
    ],
    metrics: [
      { label: "Crawled URLs", value: "Coverage" },
      { label: "Page fields", value: "Checks" },
      { label: "Affected pages", value: "Scope" },
      { label: "Audit history", value: "Progress" },
    ],
    showMetrics: true,
    useCases: [
      "Audit a new site before publishing SEO work.",
      "Find technical issues after a migration or redesign.",
      "Export crawled page data and Lighthouse findings for developers and content teams.",
    ],
    differentiators: [
      "A practical crawler built into the same workspace as keyword and domain research.",
      "Open-source implementation for teams that want to inspect or extend the audit flow.",
      "Simple reports that expose page-level signals and optional Lighthouse findings instead of relying only on a generic score.",
    ],
    related: [
      { label: "Domain Overview", href: "/features/domain-overview" },
      { label: "Backlink Checker", href: "/features/backlink-checker" },
      { label: "Keyword Research", href: "/features/keyword-research" },
    ],
    faqs: [
      {
        question: "What does the OpenSEO site audit tool check?",
        answer:
          "OpenSEO crawls pages, shows page-level technical signals, and can attach Lighthouse issue details when Lighthouse is enabled.",
      },
      {
        question: "Is OpenSEO a free SEO audit tool?",
        answer:
          "OpenSEO is open source and can be self-hosted. Managed usage depends on the crawl and data costs behind each workflow.",
      },
      {
        question: "Who should use OpenSEO Site Audit?",
        answer:
          "It is useful for founders, marketers, agencies, and developers who need a shared crawl report and optional Lighthouse issue export.",
      },
    ],
  },
  backlinkChecker: {
    slug: FEATURE_PAGE_SLUGS.backlinkChecker,
    eyebrow: "Backlinks",
    navDescription: "Check links and referring domains.",
    title: "Backlink checker for understanding a domain's link profile",
    description:
      "Analyze backlinks, referring domains, and linked pages without separating link research from the rest of your SEO workspace.",
    primaryKeyword: "backlink checker",
    secondaryKeywords: [
      "free backlink checker",
      "backlink analysis tool",
      "google backlink checker",
    ],
    imageAlt: "OpenSEO backlinks report",
    imageSrc:
      "https://imagedelivery.net/ysLOa6bzFaM49Jxok-TAlw/d97206ed-bd64-447c-2b9e-1b9f07c5ec00/public",
    workflows: [
      {
        title: "Check a domain's backlinks",
        description:
          "Look up backlinks and referring-domain signals for your site, competitors, or pages you are evaluating.",
      },
      {
        title: "Compare link quality",
        description:
          "Use backlink rows, referring-domain rows, rank, spam, broken, lost, and nofollow signals to inspect link quality.",
      },
      {
        title: "Filter and export link data",
        description:
          "Export and filter backlink, referring-domain, and top-page data for your own outreach, competitor research, or cleanup review.",
      },
    ],
    metrics: [
      { label: "Backlinks", value: "Links" },
      { label: "Referring domains", value: "Sources" },
      { label: "Target URLs", value: "Distribution" },
      { label: "Rank and spam signals", value: "Quality context" },
    ],
    showMetrics: true,
    useCases: [
      "See who links to a competitor.",
      "Inspect link opportunities for important pages.",
      "Understand whether a domain has real authority before investing in content.",
    ],
    differentiators: [
      "Backlink analysis sits beside keyword research, domain overview, and audit data.",
      "Self-host or adapt backlink reporting for your team's workflow.",
      "MCP support lets an AI agent pull backlink context during SEO research.",
    ],
    related: [
      {
        label: "Link Prospecting",
        href: "/docs/skills/link-prospecting",
      },
      { label: "Domain Overview", href: "/features/domain-overview" },
      { label: "OpenSEO MCP", href: "/features/mcp" },
    ],
    faqs: [
      {
        question: "What is a backlink checker used for?",
        answer:
          "A backlink checker helps you understand which sites link to a domain or page, which links have stronger rank, spam, broken, lost, or nofollow signals, and where competitors are earning authority.",
      },
      {
        question: "Can I check competitor backlinks in OpenSEO?",
        answer:
          "Yes. OpenSEO's backlink workflow is designed for researching your own domain as well as competitor domains.",
      },
      {
        question: "How does backlink research connect to SEO planning?",
        answer:
          "Backlinks add link-profile context that can inform link-building, digital PR, and competitor research alongside your keyword work.",
      },
    ],
  },
  domainOverview: {
    slug: FEATURE_PAGE_SLUGS.domainOverview,
    eyebrow: "Domain Overview",
    navDescription: "Analyze competitor visibility.",
    title: "Domain overview: traffic, keywords, and pages for any domain",
    description:
      "Get a domain overview of any website: estimated organic traffic, ranking keywords, and top organic pages, with one click into backlink and keyword research.",
    primaryKeyword: "domain overview",
    secondaryKeywords: [
      "domain analysis tool",
      "competitor keyword analysis tool",
      "website traffic checker",
    ],
    imageAlt: "OpenSEO domain overview",
    imageSrc:
      "https://imagedelivery.net/ysLOa6bzFaM49Jxok-TAlw/189e22b8-fdf8-46b4-198c-e912beef2300/public",
    workflows: [
      {
        title: "Analyze a domain",
        description:
          "Start with a domain and get an overview of estimated organic traffic, organic keyword count, top ranking keywords, and top organic pages.",
      },
      {
        title: "Find competitor keywords",
        description:
          "Inspect keywords a competitor already ranks for and identify topics worth building or defending.",
      },
      {
        title: "Move into deeper research",
        description:
          "Use domain insights to open keyword research, backlink analysis, or rank tracking without starting over.",
      },
    ],
    metrics: [
      { label: "Organic traffic", value: "Visibility" },
      { label: "Organic keywords", value: "Topics" },
      { label: "Top keywords", value: "Rankings" },
      { label: "Top pages", value: "Organic reach" },
    ],
    showMetrics: true,
    useCases: [
      "Research a competitor before writing a content plan.",
      "Estimate a site's organic footprint.",
      "Find keyword gaps between your site and the domains already ranking.",
    ],
    differentiators: [
      "Domain research connects directly to keyword, backlink, and rank tracking workflows.",
      "Built around ranking keywords, estimated traffic, and top pages for practical competitor research.",
      "Open-source and self-hostable for teams that want control over their SEO stack.",
    ],
    related: [
      {
        label: "Competitor Analysis",
        href: "/docs/skills/competitor-analysis",
      },
      { label: "Keyword Research", href: "/features/keyword-research" },
      { label: "Backlink Checker", href: "/features/backlink-checker" },
    ],
    faqs: [
      {
        question: "What is a domain overview?",
        answer:
          "A domain overview is a snapshot of a website's organic search footprint: estimated organic traffic, how many keywords it ranks for, its top ranking keywords, and its top organic pages. It's usually the first step in competitor research because it shows where a site earns its visibility.",
      },
      {
        question: "How does this compare to Semrush Domain Overview?",
        answer:
          "OpenSEO covers the core of the same report (estimated traffic, organic keywords, top keywords, and top pages) without a triple-digit monthly seat. OpenSEO is open source, so you can self-host it, and the managed app is $10/month and includes usage credits.",
      },
      {
        question: "Can OpenSEO help with competitor keyword analysis?",
        answer:
          "Yes. Domain Overview is designed to reveal the keywords and topics a competitor is already visible for.",
      },
      {
        question: "Is Domain Overview the same as a traffic checker?",
        answer:
          "It includes traffic-oriented visibility metrics, but the bigger value is connecting that traffic estimate to ranking keywords and top pages.",
      },
    ],
  },
  rankTracking: {
    slug: FEATURE_PAGE_SLUGS.rankTracking,
    eyebrow: "Rank Tracking",
    navDescription: "Monitor keyword positions.",
    title: "Rank tracker for monitoring keyword positions",
    description:
      "Track the keywords that matter, optionally compare desktop and mobile results, and keep ranking changes connected to your research workflow.",
    primaryKeyword: "rank tracker",
    secondaryKeywords: [
      "seo rank tracking tool",
      "keyword rank tracker",
      "google rank tracker",
    ],
    imageAlt: "OpenSEO rank tracking table",
    imageSrc:
      "https://imagedelivery.net/ysLOa6bzFaM49Jxok-TAlw/4a0f8508-1527-46a8-c91c-086456f21c00/public",
    workflows: [
      {
        title: "Add tracked domains",
        description:
          "Create rank tracking configurations for the domains and locations you care about.",
      },
      {
        title: "Track important keywords",
        description:
          "Add keywords manually or from ranking suggestions and monitor positions over time.",
      },
      {
        title: "Compare SERP context",
        description:
          "Review the configured device results, ranking URLs, movement, and available SERP feature signals.",
      },
    ],
    metrics: [
      { label: "Desktop rank", value: "When enabled" },
      { label: "Mobile rank", value: "When enabled" },
      { label: "SERP features", value: "Context" },
      { label: "Position change", value: "Movement" },
    ],
    showMetrics: true,
    useCases: [
      "Monitor target keywords after publishing content.",
      "Track launch, migration, and optimization impact.",
      "Keep ranking checks close to the keywords your team already researched.",
    ],
    differentiators: [
      "Rank tracking is part of the same workspace as discovery, audit, and competitor research.",
      "Optional desktop and mobile tracking helps teams avoid one-dimensional rank reports.",
      "OpenSEO can expose ranking data to AI agents through MCP.",
    ],
    related: [
      { label: "Keyword Clustering", href: "/docs/skills/keyword-clustering" },
      {
        label: "Competitor Analysis",
        href: "/docs/skills/competitor-analysis",
      },
      { label: "Keyword Research", href: "/features/keyword-research" },
    ],
    faqs: [
      {
        question: "What is a rank tracker?",
        answer:
          "A rank tracker monitors where a domain appears for selected keywords over time so you can see whether SEO work is improving visibility.",
      },
      {
        question: "Does OpenSEO track mobile and desktop rankings?",
        answer:
          "OpenSEO rank tracking can be configured for mobile, desktop, or both, so teams can compare devices when both are enabled.",
      },
      {
        question: "How should I choose keywords to track?",
        answer:
          "Start with keywords tied to important pages, active content work, and competitor opportunities discovered in keyword research.",
      },
    ],
  },
  savedKeywords: {
    slug: FEATURE_PAGE_SLUGS.savedKeywords,
    eyebrow: "Saved Keywords",
    navDescription: "Organize SEO opportunities.",
    title: "Saved keywords for turning SEO research into a plan",
    description:
      "Keep useful keyword ideas organized so they can inform content planning, rank tracking decisions, and AI-agent workflows.",
    primaryKeyword: "saved keywords",
    secondaryKeywords: [
      "seo keyword list",
      "keyword list tool",
      "keyword planning",
    ],
    imageAlt: "OpenSEO saved keywords list",
    imageSrc:
      "https://imagedelivery.net/ysLOa6bzFaM49Jxok-TAlw/8938a529-b443-4d4f-9869-c972f3cef900/public",
    workflows: [
      {
        title: "Save promising keywords",
        description:
          "Collect useful ideas from keyword research instead of losing them after each search.",
      },
      {
        title: "Organize by topic",
        description:
          "Tag keywords by page, campaign, content cluster, or priority so planning stays readable.",
      },
      {
        title: "Reuse saved keywords across workflows",
        description:
          "Use saved keywords and tags as a planning reference for rank tracking, content planning, or MCP-powered research.",
      },
    ],
    metrics: [
      { label: "Saved ideas", value: "Pipeline" },
      { label: "Tags", value: "Organization" },
      { label: "Volume", value: "Demand" },
      { label: "Difficulty", value: "Priority" },
    ],
    useCases: [
      "Tag keyword ideas into topic or page groups from keyword research.",
      "Prepare candidate keywords to add to rank tracking.",
      "Keep human and AI-agent research in the same workspace.",
    ],
    differentiators: [
      "Saved keywords bridge research, tracking, and AI workflows.",
      "Saved keywords preserve available metrics like volume, CPC, difficulty, intent, and tags.",
      "The workflow stays simple enough for repeated planning sessions.",
    ],
    related: [
      { label: "Keyword Research", href: "/features/keyword-research" },
      { label: "Rank Tracking", href: "/features/rank-tracking" },
      { label: "OpenSEO MCP", href: "/features/mcp" },
    ],
    faqs: [
      {
        question: "Why save keywords in an SEO tool?",
        answer:
          "Saved keywords keep research organized so teams can return to the ideas that are worth writing, optimizing, or tracking.",
      },
      {
        question: "Can saved keywords be used with rank tracking?",
        answer:
          "Yes. Saved keywords are a natural source for deciding which terms should be monitored over time.",
      },
      {
        question: "How do saved keywords fit into SEO planning?",
        answer:
          "Saved Keywords keeps promising ideas organized so they can inform content planning, rank tracking decisions, and future research.",
      },
    ],
  },
  aiBrandVisibility: {
    slug: FEATURE_PAGE_SLUGS.aiBrandVisibility,
    eyebrow: "AI Visibility",
    navDescription: "Look up brand mentions in AI search.",
    title: "Brand lookup for ChatGPT and Google AI Overview visibility",
    description:
      "Look up a brand or domain and review ChatGPT and Google AI Overview mentions, cited pages, and related prompts.",
    primaryKeyword: "ai visibility tool",
    secondaryKeywords: [
      "brand visibility ai search",
      "ai search visibility",
      "answer engine optimization",
    ],
    imageAlt: "OpenSEO AI brand visibility report",
    imageSrc:
      "https://imagedelivery.net/ysLOa6bzFaM49Jxok-TAlw/cde3e4f8-079f-4890-cb17-371087107400/public",
    workflows: [
      {
        title: "Look up a brand",
        description:
          "Search for a brand or domain and inspect how ChatGPT and Google AI Overview mention or cite it in available results.",
      },
      {
        title: "Review citations and platforms",
        description:
          "Review the URLs, domains, and platforms contributing to brand mentions.",
      },
      {
        title: "Find visibility gaps",
        description:
          "Use cited pages and related prompts as clues for content, reputation, or comparison coverage to investigate.",
      },
    ],
    metrics: [
      { label: "Mentions", value: "Presence" },
      { label: "Citations", value: "Sources" },
      { label: "Platforms", value: "Surfaces" },
      { label: "Cited domains", value: "Sources" },
    ],
    useCases: [
      "See whether ChatGPT and Google AI Overview data mention or cite your brand or domain.",
      "Find pages and domains cited alongside brand mentions.",
      "Use cited sources and prompts to plan content experiments for answer-engine visibility.",
    ],
    differentiators: [
      "AI visibility sits beside classic SEO research instead of replacing it.",
      "The workflow focuses on concrete sources and mentions, not vague AI hype.",
      "OpenSEO helps teams connect AI mention and citation research to concrete SEO planning.",
    ],
    related: [
      { label: "AI Search Prompts", href: "/features/ai-search-prompts" },
      { label: "Domain Overview", href: "/features/domain-overview" },
      { label: "OpenSEO MCP", href: "/features/mcp" },
    ],
    faqs: [
      {
        question: "What is AI brand visibility?",
        answer:
          "AI brand visibility is how often your brand or domain appears in available ChatGPT and Google AI Overview mention and citation data.",
      },
      {
        question: "How is AI visibility different from traditional SEO?",
        answer:
          "Traditional SEO focuses on rankings and pages. OpenSEO's AI visibility workflow looks at mentions, cited pages, related prompts, and platform-level metrics from supported AI-search sources.",
      },
      {
        question: "Should AI visibility replace keyword research?",
        answer:
          "No. It should sit beside keyword, domain, backlink, and audit data so teams can understand both search rankings and answer coverage.",
      },
    ],
  },
  aiSearchPrompts: {
    slug: FEATURE_PAGE_SLUGS.aiSearchPrompts,
    eyebrow: "Prompt Explorer",
    navDescription: "Compare answers across supported models.",
    title: "AI search prompt explorer for visibility research",
    description:
      "Run the same prompt across supported AI models, compare the answers, and review citations when they are returned.",
    primaryKeyword: "ai search visibility",
    secondaryKeywords: [
      "chatgpt search visibility",
      "ai search prompts",
      "answer engine optimization tool",
    ],
    imageAlt: "OpenSEO prompt explorer",
    imageSrc:
      "https://imagedelivery.net/ysLOa6bzFaM49Jxok-TAlw/9f3d38f2-aa97-417c-ca74-ae378654d700/public",
    workflows: [
      {
        title: "Test category prompts",
        description:
          "Compare answers to the questions your customers might ask AI tools.",
      },
      {
        title: "Inspect web-backed answers",
        description:
          "When web search is enabled, inspect the pages and domains cited by model responses.",
      },
      {
        title: "Check brand mentions",
        description:
          "Highlight a brand and see whether each model mentions it in the answer or cited sources.",
      },
    ],
    metrics: [
      { label: "Prompts", value: "Questions" },
      { label: "Web context", value: "Sources" },
      { label: "Web search country", value: "Regional context" },
      { label: "Brand mentions", value: "Presence" },
    ],
    useCases: [
      "Compare how supported AI models answer the same prompt.",
      "Review which pages and domains appear in cited sources.",
      "Check whether a brand appears in AI answers and citations.",
    ],
    differentiators: [
      "Prompt research lives in the same workspace as domain, keyword, and brand visibility workflows.",
      "OpenSEO treats AI search as a research layer, not a replacement for SEO fundamentals.",
      "OpenSEO MCP exposes keyword, SERP, domain, backlink, saved keyword, and rank-tracking tools to AI agents.",
    ],
    related: [
      { label: "AI Brand Visibility", href: "/features/ai-brand-visibility" },
      { label: "Keyword Research", href: "/features/keyword-research" },
      { label: "OpenSEO MCP", href: "/features/mcp" },
    ],
    faqs: [
      {
        question: "What is an AI search prompt explorer?",
        answer:
          "It lets teams run the same prompt across supported AI models, compare answers, and inspect citation URLs returned with supported model responses.",
      },
      {
        question: "Why does prompt research matter for SEO?",
        answer:
          "Prompts reveal comparison, problem, and buying questions that can inform pages, guides, and the pages or domains that appear in returned citations.",
      },
      {
        question: "Can this help with answer engine optimization?",
        answer:
          "Yes. Prompt Explorer is a starting point for mapping prompt responses and returned citations back to source pages and possible SEO follow-up work.",
      },
    ],
  },
} satisfies Record<string, FeaturePage>;

export const featureGroups = [
  {
    label: "Keyword workflows",
    description: "Find, organize, and monitor the keywords that matter.",
    pages: [
      featurePages.keywordResearch,
      featurePages.savedKeywords,
      featurePages.rankTracking,
    ],
  },
  {
    label: "Domain research",
    description: "Understand competitors, backlinks, and technical health.",
    pages: [
      featurePages.domainOverview,
      featurePages.backlinkChecker,
      featurePages.siteAudit,
    ],
  },
  {
    label: "AI visibility",
    description: "Research AI search prompts, citations, and brand visibility.",
    pages: [featurePages.aiBrandVisibility, featurePages.aiSearchPrompts],
  },
] as const;
