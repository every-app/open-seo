import { FEATURE_PAGE_SLUGS } from "@/lib/feature-page-slugs";

export type FeaturePage = {
  slug: string;
  eyebrow: string;
  navDescription: string;
  title: string;
  description: string;
  /** Meta description override. Falls back to `description`, which also renders on the page. */
  seoDescription?: string;
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
  featuredLink?: {
    title: string;
    description: string;
    href: string;
  };
  related: Array<{
    label: string;
    href: string;
  }>;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
  guides?: {
    title: string;
    description: string;
    items: Array<{
      label: string;
      description: string;
      href: string;
    }>;
    cta: {
      label: string;
      href: string;
    };
  };
  /** Per-page section headings. Each falls back to the template's default label. */
  headings?: {
    workflows?: string;
    metrics?: string;
    useCases?: string;
    differentiators?: string;
    related?: string;
    faq?: string;
  };
  /** Free tools shown as cards under the hero. Takes the place of `featuredLink`. */
  toolCallout?: {
    title: string;
    description: string;
    links: Array<{
      title: string;
      description: string;
      href: string;
    }>;
  };
  /** Longer sections that answer the questions competing pages answer. */
  contextSections?: Array<{
    title: string;
    body: string;
  }>;
  /** A data image shown with the context sections. */
  contextImage?: {
    src: string;
    alt: string;
    caption: string;
    width: number;
    height: number;
  };
  /** Emit SoftwareApplication, FAQPage and BreadcrumbList JSON-LD. */
  structuredData?: boolean;
};

export const featurePages = {
  keywordResearch: {
    slug: FEATURE_PAGE_SLUGS.keywordResearch,
    eyebrow: "Keyword Research",
    navDescription: "Find keyword ideas and SERPs.",
    title: "Keyword research tool that shows the SERP behind every number",
    description:
      "Find keyword ideas, compare search volume and difficulty, inspect SERP results, and save the opportunities worth building around.",
    seoDescription:
      "Find keyword ideas with search volume and difficulty, check the Google results behind each one, and save the ones worth writing. Free to start, then $10/month.",
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
    headings: {
      workflows: "Find ideas, check the SERP, save what's worth writing",
      metrics: "What comes with every keyword",
      useCases: "When teams open keyword research",
      differentiators: "Why research here instead of a $100+ suite",
      related: "Where the research goes next",
      faq: "Keyword research questions",
    },
    toolCallout: {
      title: "Start with one topic before you sign up",
      description: "Two free tools from OpenSEO. No signup required.",
      links: [
        {
          title: "Free keyword generator",
          description:
            "Type a topic and get up to 20 keyword ideas with search volume and difficulty.",
          href: "/keyword-generator",
        },
        {
          title: "Free competitor analysis",
          description:
            "See a competitor's top 20 keywords and up to 20 they rank for that you don't.",
          href: "/competitor-analysis",
        },
      ],
    },
    contextSections: [
      {
        title: "Why the SERP matters more than the numbers",
        body: 'Volume and difficulty don\'t tell you what an idea means. Seed "keyword research" and you get 300 ideas, but only 45 of them contain the word "keyword". The biggest, easiest-looking one is "research synonyms", with 14,800 searches a month and a difficulty of 0, and nobody searching it wants an SEO tool. Open the results page for an idea before you write for it. If the pages ranking don\'t match what you sell, the numbers don\'t matter.',
      },
      {
        title: "How it compares with Google Keyword Planner and free tools",
        body: "Google Keyword Planner is the free option most guides point to, and it sits inside Google Ads. OpenSEO's free keyword generator is the quick version of this tool: one topic in, up to 20 ideas out, with volume and difficulty and no account. The full tool returns up to 500 ideas per search and adds CPC, search intent and the live results page for each keyword. Keyword data covers 211 countries. 94 of them have full metrics. In the other 117 the data comes from Google Ads, which has volume and CPC but no difficulty or intent.",
      },
      {
        title: "Keyword research with ChatGPT or Claude, using real numbers",
        body: "Ask a chat assistant for search volumes and it will guess. Connect OpenSEO over MCP and the assistant pulls keyword ideas and metrics from the same data this page uses. The keyword research skill gives it an order of work: expand a seed, check who ranks, then save the keepers to your list. You keep the conversation, and every number can be checked.",
      },
    ],
    contextImage: {
      src: "/features/keyword-research/openseo-keyword-research-ideas-on-topic.png",
      alt: "Scatter chart of 290 keyword ideas for the seed keyword research, plotting monthly US searches against keyword difficulty. 45 ideas that contain the word keyword are orange; the rest are grey, led by research synonyms at 14,800 searches a month and difficulty 0.",
      caption:
        "300 ideas from one seed. The easiest, biggest ones are off-topic.",
      width: 1600,
      height: 900,
    },
    structuredData: true,
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
          "Not unlimited: quality keyword data costs money everywhere, which is why the big SEO suites run $100/month and up. You can start OpenSEO for free; the paid plan is $10/month with usage credits included. It's also open source, so you can self-host with your own DataForSEO account.",
      },
      {
        question: "Does OpenSEO show live search results?",
        answer:
          "Yes. Keyword research can be paired with SERP inspection so you can see ranking pages alongside the metrics.",
      },
      {
        question: "How many keyword ideas does one search return?",
        answer:
          "Up to 500. You pick 150, 300 or 500 before you run the search. The free keyword generator returns up to 20 without signup.",
      },
      {
        question: "Which countries have keyword data?",
        answer:
          "211 countries. 94 of them get full metrics, including keyword difficulty and search intent. The other 117 are served from Google Ads data, which has search volume and CPC but no difficulty or intent.",
      },
    ],
    guides: {
      title: "The Keyword Research Strategy Library",
      description:
        "Practitioner strategies for using keyword research to discover demand. Each guide includes a full walkthrough and a copy-paste MCP prompt.",
      items: [
        {
          label: "Seed from conversation, not a volume report",
          description:
            "Harvest seed keywords from sales calls and support tickets.",
          href: "/library/keyword-research/seed-from-conversation",
        },
        {
          label: "What are long-tail keywords, and how to mine them",
          description:
            "PAA fan-out, autocomplete harvesting, and your own GSC queries.",
          href: "/library/keyword-research/long-tail-question-mining",
        },
        {
          label: "Search-intent mapping (hot / warm / cold)",
          description: "Sort keywords by buying temperature before you write.",
          href: "/library/keyword-research/search-intent-mapping",
        },
        {
          label: "Cluster keywords into topical hubs",
          description:
            "One page per intent, plus the keyword cannibalization fix.",
          href: "/library/keyword-research/cluster-topical-hubs",
        },
      ],
      cta: {
        label: "Browse all keyword research strategies",
        href: "/library/keyword-research",
      },
    },
  },
  siteAudit: {
    slug: FEATURE_PAGE_SLUGS.siteAudit,
    eyebrow: "Site Audit",
    navDescription: "Audit page-level SEO signals.",
    title:
      "SEO audit tool that crawls, renders and sorts every issue by severity",
    description:
      "Crawl a site, check every page for 32 types of technical issue, and work through them in order: critical first, then warnings, then info. Optional Lighthouse checks add performance, accessibility and best-practice findings.",
    seoDescription:
      "Crawl your site and get every technical issue sorted by severity: broken links, blocked pages, missing titles, optional Lighthouse checks. Free up to 50 pages.",
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
          "Enter a URL and a page limit. The crawler follows robots.txt, stays on your domain, and checks status codes, titles, meta descriptions, headings, canonicals, links, image alt text and response time on every page.",
      },
      {
        title: "Work the issues by severity",
        description:
          "Critical issues come first: blocked pages, server errors, broken internal links and missing titles. Warnings and info follow, so the report reads as a queue instead of a score.",
      },
      {
        title: "Drill into affected URLs",
        description:
          "Each issue opens to the exact URLs it affects, with the flagged title or meta description shown. Export the list for a developer or a content writer.",
      },
    ],
    metrics: [
      { label: "Crawled URLs", value: "Coverage" },
      { label: "Issue severity", value: "Priority" },
      { label: "Affected pages", value: "Scope" },
      { label: "Audit history", value: "Progress" },
    ],
    showMetrics: true,
    useCases: [
      "Audit a new site before publishing SEO work.",
      "Find what broke after a migration or redesign.",
      "Hand developers a list of URLs to fix instead of a generic score.",
    ],
    differentiators: [
      "The crawler is built into the same workspace as keyword, rank and backlink research.",
      "Your AI agent can run an audit and read the issues over MCP, then work through them with you.",
      "Open source, so you can read exactly what each check looks for.",
    ],
    headings: {
      workflows: "Run a crawl, get a ranked work queue",
      metrics: "What one audit covers",
      useCases: "When to run an audit",
      differentiators: "Why audit here",
      related: "Tools to use alongside the audit",
      faq: "Site audit questions",
    },
    toolCallout: {
      title: "Fix the title and meta issues the audit finds",
      description: "A free tool from OpenSEO. No signup required.",
      links: [
        {
          title: "Free SERP simulator",
          description:
            "The audit flagged a title as too long? Paste it in and see where Google cuts it, on desktop and mobile.",
          href: "/serp-simulator",
        },
      ],
    },
    contextSections: [
      {
        title: "33 issue types, sorted by what to fix first",
        body: "Every issue the crawler reports carries a severity. Four are critical: the crawler was blocked, a server error, a broken internal link, or a missing title. Twenty are warnings, including duplicate titles and content, redirect chains and loops, conflicting canonicals, thin content and orphan pages. Four of those warnings tell you when the crawl itself stopped early, so a short report never passes for a clean one. The other nine are info, like title length and pages buried deep in the site. Each issue opens to the URLs it affects.",
      },
      {
        title: "Audits that see JavaScript sites",
        body: "A crawler that reads only raw HTML sees an empty shell on many modern sites. Turn on rendering and OpenSEO loads each page in a browser before checking it, up to your plan's page limit. Pages that come back as a bot challenge get a second try with a different renderer. Rendered audits use credits for the pages they render and stop after 22 hours. When a site rate-limits the crawl, the audit slows down and retries instead of marking every page blocked, and site owners can verify the OpenSEO-Audit crawler before letting it through.",
      },
      {
        title: "Run an audit from your AI agent",
        body: "Connect OpenSEO to Claude, Cursor or ChatGPT over MCP and the agent can start an audit, check its progress and read the issues by severity. Ask it which critical issues to fix first, or to draft new titles for every page flagged as too long, and it works from the same report you see in the app.",
      },
    ],
    contextImage: {
      src: "/features/site-audit/openseo-site-audit-issue-types-by-severity.png",
      alt: "List of the 32 issue types an OpenSEO site audit checks, in three columns: 4 critical (crawler was blocked, server error, broken internal link, missing title tag), 19 warnings and 9 info.",
      caption:
        "The check list, grouped the way the report sorts it. A page-limit warning has been added since.",
      width: 1600,
      height: 900,
    },
    structuredData: true,
    related: [
      { label: "Domain Overview", href: "/features/domain-overview" },
      { label: "Backlinks", href: "/features/backlink-checker" },
      { label: "Keyword Research", href: "/features/keyword-research" },
    ],
    faqs: [
      {
        question: "What does the OpenSEO site audit tool check?",
        answer:
          "33 issue types across every crawled page, including status codes, titles, meta descriptions, headings, canonicals, redirects, internal links, image alt text and response time. Enable Lighthouse and a sample of pages also gets performance, SEO, accessibility and best-practice findings.",
      },
      {
        question: "Is OpenSEO a free SEO audit tool?",
        answer:
          "For smaller sites, yes: the free plan includes site audits up to 50 pages per crawl. Larger crawls need a paid plan, starting at $10/month. OpenSEO is also open source and self-hostable.",
      },
      {
        question: "How many pages can one audit crawl?",
        answer:
          "Up to 50 pages per audit on the free plan and up to 10,000 on a paid plan. Rendered audits follow the same page limit and stop after 22 hours.",
      },
      {
        question: "Can OpenSEO audit a JavaScript site?",
        answer:
          "Yes. Turn on rendering and OpenSEO loads each page in a browser before checking it. Rendered audits use more credits than a plain crawl.",
      },
      {
        question: "Who should use OpenSEO Site Audit?",
        answer:
          "Founders, marketers, agencies and developers who need a shared crawl report they can work through and export.",
      },
    ],
    guides: {
      title: "The Site Audit Strategy Library",
      description:
        "Practitioner strategies for turning a crawl into scheduled work. Each guide includes a full walkthrough and a copy-paste MCP prompt.",
      items: [
        {
          label: "The technical SEO audit checklist that ends in fixes",
          description:
            "Triage 1,180 findings down to the 35 that stop a page being seen.",
          href: "/library/site-audit/technical-seo-audit-checklist",
        },
        {
          label: "Write an audit report the client will actually act on",
          description:
            "Six sections that tie each finding to a page, a cost, and an owner.",
          href: "/library/site-audit/seo-audit-report-template",
        },
        {
          label: "Index bloat: when the fix is deleting pages",
          description:
            "Check what Google actually indexed before you remove anything.",
          href: "/library/site-audit/index-bloat",
        },
      ],
      cta: {
        label: "Browse all site audit strategies",
        href: "/library/site-audit",
      },
    },
  },
  backlinks: {
    slug: FEATURE_PAGE_SLUGS.backlinks,
    eyebrow: "Backlinks",
    navDescription: "Check links and referring domains.",
    title:
      "Backlink analysis tool for referring domains, anchors, spam and lost links",
    description:
      "Analyze backlinks, referring domains, and linked pages without separating link research from the rest of your SEO workspace.",
    seoDescription:
      "Go past a quick backlink check: page through every link, see anchors, filter out spam and lost links, and export the list for any domain. $10/month.",
    primaryKeyword: "backlink analysis",
    secondaryKeywords: [
      "backlink analysis tool",
      "referring domains",
      "link profile",
    ],
    imageAlt: "OpenSEO backlinks report",
    imageSrc:
      "https://imagedelivery.net/ysLOa6bzFaM49Jxok-TAlw/d97206ed-bd64-447c-2b9e-1b9f07c5ec00/public",
    workflows: [
      {
        title: "Look up any domain, folder or page",
        description:
          "Enter a domain, a subdomain, a folder or a single page. The overview shows backlinks, referring domains, domain rank and spam score, and for a whole domain, a year of monthly link growth.",
      },
      {
        title: "Judge the links",
        description:
          "Sort by rank, spam score or first seen. Hide spam, lost, broken or nofollow links, and switch between the strongest link per domain and every individual link.",
      },
      {
        title: "Export the list",
        description:
          "Send backlinks, referring domains or top linked pages to CSV or Google Sheets for outreach, competitor research or a cleanup review.",
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
    headings: {
      workflows: "Pull a profile, judge the links, export the list",
      metrics: "What every backlink lookup tells you",
      useCases: "When to run backlink analysis",
      differentiators: "Why analyze links next to your keyword data",
      related: "Where link research goes next",
      faq: "Backlink analysis questions",
    },
    toolCallout: {
      title: "Check any domain's links before you open the full report",
      description: "Two free tools from OpenSEO. No signup required.",
      links: [
        {
          title: "Free backlink checker",
          description:
            "Summary metrics and the top 15 backlinks for any domain, one per referring domain, strongest first.",
          href: "/backlink-checker",
        },
        {
          title: "Free spam score checker",
          description:
            "A domain's backlink spam score and the 10 spammiest domains linking to it.",
          href: "/spam-score-checker",
        },
      ],
    },
    contextSections: [
      {
        title: "Count referring domains, not backlinks",
        body: "openseo.so has 9,499 backlinks from 495 referring domains. One of those domains links from 3,243 of its pages, which makes 3,754 links: 40% of the total, and more than the next nine domains combined. Counted as backlinks, that one site looks like most of the profile. Counted as referring domains, it is one of 495. Start with the referring domains tab, then expand a domain to see its individual links.",
      },
      {
        title: "Analyze a competitor's backlinks in four steps",
        body: "Enter the competitor's domain and open referring domains. Sort by first seen to see who linked to them recently. Spam is hidden by default, so add the lost and broken filters and read what's left: those are the sites that link in your space. Export the list for outreach, or hand it to your AI agent with the link prospecting skill.",
      },
      {
        title: "Backlink analysis from your AI agent",
        body: "Connect OpenSEO to Claude, Cursor or ChatGPT over MCP and the agent can pull a backlink overview or the full link list mid-conversation, with the same filters as the app. The link prospecting skill turns that into a short list: sites with a real reason to link to your page, and an outreach angle for each.",
      },
    ],
    contextImage: {
      src: "/features/backlink-checker/openseo-backlinks-links-vs-referring-domains.png",
      alt: "Two stacked bars for openseo.so. Backlinks: 9,499, of which the top referring domain supplies 3,754, the next nine domains 2,782 and all others 2,963. Referring domains: 495, where the same top domain is a single sliver.",
      caption:
        "The same profile counted two ways. One domain supplies 40% of the links and counts once.",
      width: 1600,
      height: 900,
    },
    structuredData: true,
    guides: {
      title: "The Link Building Strategy Library",
      description:
        "Practitioner strategies for reading a backlink profile and earning links that count. Each guide includes a full walkthrough and a copy-paste MCP prompt.",
      items: [
        {
          label: "The backlink audit",
          description:
            "Sort by first seen, bucket the junk, read the rows that matter.",
          href: "/library/link-building/backlink-audit",
        },
        {
          label: "Referring domains, not backlinks",
          description:
            "The count to report, and what the top of the list is made of.",
          href: "/library/link-building/referring-domains",
        },
        {
          label: "How to get backlinks",
          description:
            "Start from the pages that already earn them. Four plays from the podcast.",
          href: "/library/link-building/how-to-get-backlinks",
        },
      ],
      cta: {
        label: "Browse all link building strategies",
        href: "/library/link-building",
      },
    },
    related: [
      {
        label: "Link Prospecting",
        href: "/docs/skills/link-prospecting",
      },
      { label: "Domain Overview", href: "/features/domain-overview" },
    ],
    faqs: [
      {
        question: "What is backlink analysis used for?",
        answer:
          "Backlink analysis helps you understand which sites link to a domain or page, which links have stronger rank, spam, broken, lost, or nofollow signals, and where competitors are earning authority.",
      },
      {
        question: "Can I check competitor backlinks in OpenSEO?",
        answer:
          "Yes. Enter any domain, yours or a competitor's, and pull its backlinks, referring domains, and top linked pages.",
      },
      {
        question: "How does backlink research connect to SEO planning?",
        answer:
          "Backlinks tell you whether a page ranks on content or on authority. Check them before targeting a keyword to judge whether you can realistically outrank the incumbents, and check a competitor's profile to find sites that might link to you too.",
      },
      {
        question: "Does OpenSEO hide spam backlinks?",
        answer:
          "Yes, by default. Links with a spam score of 40 or higher, out of 100, drop out of the backlinks list. Turn the filter off to see them.",
      },
      {
        question: "How far back does backlink history go?",
        answer:
          "A domain lookup shows monthly backlink and referring-domain counts for the last 12 months, with new and lost links per month. A single page or a folder shows current counts without the trend.",
      },
      {
        question: "Is there a free backlink checker?",
        answer:
          "Yes. The free backlink checker shows summary metrics and the top 15 backlinks for any domain without signup. The full report pages through every link with filters and export, and each new lookup uses credits. Looking up the same target again within 6 hours reuses the result at no cost.",
      },
    ],
  },
  domainOverview: {
    slug: FEATURE_PAGE_SLUGS.domainOverview,
    eyebrow: "Domain Overview",
    navDescription: "Analyze competitor visibility.",
    title:
      "Domain analysis tool: traffic, keywords and top pages for any website",
    description:
      "Get a domain overview of any website: estimated organic traffic, ranking keywords, and top organic pages, with filters, export and saved keywords in the same place.",
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
          "Enter a domain, a folder or a single page and pick a country. The overview shows estimated organic traffic and how many keywords the site ranks for, then lists its keywords and its top pages.",
      },
      {
        title: "Find competitor keywords",
        description:
          "Filter the keyword list by traffic, volume, CPC, difficulty or position, include or exclude words, and save the ones worth building or defending.",
      },
      {
        title: "Take the list further",
        description:
          "Export the keywords or pages to CSV, Excel or Google Sheets, or save keywords to your list for content planning and rank tracking.",
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
    headings: {
      workflows: "Read a domain, find its keywords, go deeper",
      metrics: "Four numbers in every overview",
      useCases: "When to pull a domain overview",
      differentiators: "Why do competitor research here",
      related: "Where domain research goes next",
      faq: "Domain overview questions",
    },
    toolCallout: {
      title: "Size up any domain before you sign up",
      description: "Three free tools from OpenSEO. No signup required.",
      links: [
        {
          title: "Free website traffic checker",
          description:
            "Estimated organic traffic, keyword count, and the top 5 keywords and pages for any domain. Compare two domains side by side.",
          href: "/website-traffic-checker",
        },
        {
          title: "Free competitor analysis",
          description:
            "A competitor's top 20 keywords and top 10 pages, plus up to 20 keywords they rank for that you don't.",
          href: "/competitor-analysis",
        },
        {
          title: "Free domain age checker",
          description:
            "Registration date, expiry date and registrar for up to 10 domains at once.",
          href: "/domain-age-checker",
        },
      ],
    },
    contextSections: [
      {
        title: "How much to trust a traffic estimate",
        body: "Estimated traffic is a model, not a count. It combines each keyword's search volume with an expected click rate for the position, and the data provider revises both. openseo.so is a live example. In October the model put it at 4,556 visits a month. Five weeks later it said 303. The site ranked 8th for \"linkback checker\" both times, and that one keyword's estimate fell from 1,783 visits to less than one. Read the keywords behind a total before you quote it, and compare domains on the same day.",
      },
      {
        title:
          "Check a domain before you buy it, link to it or partner with it",
        body: "Three questions settle most of it. How old is it? The domain age checker shows when it was registered and who the registrar is. Is its link profile clean? The spam score checker lists the spammiest domains linking to it. Does it earn real search traffic, and from what? The overview shows estimated traffic, the keywords behind it and the pages that rank. A domain that is old, clean and ranks for its own topic is a safer bet than one with a big traffic number built on a single keyword.",
      },
      {
        title: "Competitor research from your AI agent",
        body: "Connect OpenSEO to Claude, Cursor or ChatGPT over MCP and the agent can pull a domain's traffic estimate and the keywords it ranks for, filtered by position, volume or brand terms. The competitor analysis skill gives it an order of work: keywords, pages, backlinks and content themes, ending in what to learn from and where your site has a better angle.",
      },
    ],
    contextImage: {
      src: "/features/domain-overview/openseo-domain-overview-traffic-estimate-two-dates.png",
      alt: "Two bar charts for openseo.so in the US. Whole-site estimated organic traffic fell from 4,556 visits a month on 6 October 2026 to 303 on 16 November. The estimate for linkback checker, ranked 8th both times, fell from 1,783 to 0.2.",
      caption:
        "Same site, same position, two estimates five weeks apart. The ranking held; the estimate didn't.",
      width: 1600,
      height: 900,
    },
    structuredData: true,
    related: [
      {
        label: "Competitor Analysis",
        href: "/docs/skills/competitor-analysis",
      },
      { label: "Keyword Research", href: "/features/keyword-research" },
      { label: "Backlinks", href: "/features/backlink-checker" },
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
          "OpenSEO covers the core of the same report (estimated traffic, organic keywords, top keywords, and top pages) without a triple-digit monthly seat. OpenSEO is open source, so you can self-host it, and the managed app starts at $10/month with usage credits included.",
      },
      {
        question: "Can OpenSEO help with competitor keyword analysis?",
        answer:
          "Yes. Enter a competitor's domain and you get the keywords it ranks for and its top organic pages: the raw material for finding topics worth building or defending.",
      },
      {
        question: "Is Domain Overview the same as a traffic checker?",
        answer:
          "Not quite. It includes an estimated-traffic metric, but the value is seeing which keywords and pages produce that traffic, which a plain traffic checker doesn't show.",
      },
      {
        question: "Can I analyze a folder or a single page?",
        answer:
          "Yes. Choose a domain, a domain with its subdomains, a folder or one page. The keyword and page lists follow that choice. The traffic and keyword totals at the top always cover the whole domain.",
      },
      {
        question: "Does OpenSEO show domain authority?",
        answer:
          "Not under that name. Domain Authority is Moz's score. The backlinks report shows a domain rank next to referring domains and spam score, so you can see what the number is built from.",
      },
    ],
    guides: {
      title: "The Competitive Analysis Strategy Library",
      description:
        "Practitioner strategies for turning a domain overview into a decision. Each guide includes a full walkthrough and a copy-paste MCP prompt.",
      items: [
        {
          label: "Find out who your real competitors are",
          description:
            "Compare a keyword set and read the domains actually in your SERPs.",
          href: "/library/competitive-analysis/find-your-real-competitors",
        },
        {
          label: "Keyword gap analysis: subtract the brand terms first",
          description:
            "Strip brand from both sides and the gap becomes buildable.",
          href: "/library/competitive-analysis/keyword-gap-analysis",
        },
        {
          label: "How accurate are competitor traffic estimates?",
          description:
            "Close-variant stacking, other business lines, and how to correct for both.",
          href: "/library/competitive-analysis/competitor-traffic-estimates",
        },
        {
          label: "Read a competitor's link profile before you copy it",
          description:
            "Referring domains, spam score, and the broken links worth chasing.",
          href: "/library/competitive-analysis/backlink-gap-analysis",
        },
      ],
      cta: {
        label: "Browse all competitive analysis strategies",
        href: "/library/competitive-analysis",
      },
    },
  },
  rankTracking: {
    slug: FEATURE_PAGE_SLUGS.rankTracking,
    eyebrow: "Rank Tracking",
    navDescription: "Monitor keyword positions.",
    title: "Rank tracker for keyword positions on desktop and mobile",
    description:
      "Track the keywords that matter, optionally compare desktop and mobile results, and keep ranking changes connected to your research workflow.",
    seoDescription:
      "Track keyword positions on desktop and mobile, daily, weekly or monthly. 100 keywords checked weekly on one device costs $3 to $6 a month, shown before each run.",
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
          "Create a tracker for each domain, country or city, and language you sell in.",
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
    headings: {
      workflows: "Set up a tracker, add keywords, read the movement",
      metrics: "What each check records",
      useCases: "When to track rankings",
      differentiators: "Why track where you research",
      related: "Where to find keywords worth tracking",
      faq: "Rank tracking questions",
    },
    toolCallout: {
      title: "Pick what to track before you pay to track it",
      description: "Two free tools from OpenSEO. No signup required.",
      links: [
        {
          title: "Free competitor keyword finder",
          description:
            "See up to 20 keywords a competitor ranks for, with search demand, difficulty and the pages that rank.",
          href: "/competitor-keyword-finder",
        },
        {
          title: "Free SERP simulator",
          description:
            "Holding a position but not getting clicks? Preview your title and description on desktop and mobile.",
          href: "/serp-simulator",
        },
      ],
    },
    contextSections: [
      {
        title: "Schedules, limits and what a check costs",
        body: "Each tracker checks on the schedule you pick: daily, weekly, monthly, or only when you click. It holds up to 1,000 keywords (2,500 on the Pro plan, 5,000 on the Agency plan), on desktop, mobile or both, and reads 1 to 10 pages of results (top 40 by default). Before you save, the app shows what the tracker will cost per month. Every check catches the incomplete results Google serves some rank trackers and replaces them with the real ones, and reads a keyword a second time when it seems to have dropped out. The app shows the most a check can cost. 100 keywords on one device, checked weekly, costs about $1.30 to $2.60 a month; on both devices, about $2.60 to $5.20. Rank tracking runs on the paid plans; the free plan shows the setup but doesn't check positions.",
      },
      {
        title: "Track a city, not just a country",
        body: 'A national rank says little to a plumber in Pittsburgh. Set a tracker to a city, county or region and every check reads the results a searcher there sees. Search volume switches to the local number too. "rv storage near me" gets about 135,000 searches a month nationally and about 70 in Pittsburgh, so a national figure on a local tracker overstates demand. Language is set per tracker, so you can track Spanish searches in the US next to English ones.',
      },
      {
        title: "Why Search Console's average position isn't a rank",
        body: "Search Console averages every impression across countries, devices and personalized results into one number. That number can hold steady while your result in the one market you sell to moves. A tracker checks a fixed country or city, on a fixed device, on a schedule, so a drop shows up as a drop. Use Search Console to find the keywords worth tracking, and the tracker to watch them.",
      },
    ],
    contextImage: {
      src: "/features/rank-tracking/openseo-rank-tracker-monthly-cost.png",
      alt: "Grid of rank tracking costs for one read of 100, 250, 500 and 1,000 keywords on desktop and mobile at top 40. One read per check costs $0.50 to $4.99 a month on a monthly schedule, $2.00 to $19.97 weekly, and $14.98 to $149.76 daily.",
      caption:
        "The cost of one read of each keyword, by keyword count and schedule, before the incomplete-results check that every read now includes.",
      width: 1600,
      height: 900,
    },
    structuredData: true,
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
          "Yes: mobile, desktop, or both. Each tracked domain is configured with the devices you want, and enabling both lets you compare them side by side.",
      },
      {
        question: "How should I choose keywords to track?",
        answer:
          "Start with keywords tied to important pages, active content work, and competitor opportunities discovered in keyword research.",
      },
      {
        question: "How often does OpenSEO check rankings?",
        answer:
          "Daily, weekly or monthly, set per tracker, or only when you run a check yourself. Monthly checks run at the end of the month.",
      },
      {
        question: "How much does rank tracking cost?",
        answer:
          "It depends on the number of keywords, devices, result depth and how often you check. 100 keywords on one device, checked weekly, costs $3 to $6 a month, and twice that on desktop and mobile. The app shows the most a tracker can cost per month before you save it, and checks draw from the usage included in your plan.",
      },
      {
        question: "Can I track rankings in a specific city?",
        answer:
          "Yes. Pick a city, county or region when you set up the tracker. Positions come from that location's results, and search volume shows the local figure.",
      },
    ],
    guides: {
      title: "The Rank Tracking Strategy Library",
      description:
        "Practitioner strategies for tracking what matters and reporting it so it gets read. Each guide includes a full walkthrough and a copy-paste MCP prompt.",
      items: [
        {
          label: "Which keywords to track, and how many",
          description:
            "Twenty to fifty terms from Search Console, priced before they go in.",
          href: "/library/rank-tracking/which-keywords-to-track",
        },
        {
          label: "Is Search Console a rank tracker?",
          description:
            "What the free average position hides, and when it is enough.",
          href: "/library/rank-tracking/search-console-vs-rank-tracker",
        },
        {
          label: "Local rank tracking",
          description: "Why a local business needs a grid before a tracker.",
          href: "/library/rank-tracking/local-rank-tracking",
        },
        {
          label: "The keyword ranking report your CEO will read",
          description:
            "Lead with the business number and use rankings to explain it.",
          href: "/library/rank-tracking/keyword-ranking-report",
        },
      ],
      cta: {
        label: "Browse all rank tracking strategies",
        href: "/library/rank-tracking",
      },
    },
  },
  savedKeywords: {
    slug: FEATURE_PAGE_SLUGS.savedKeywords,
    eyebrow: "Saved Keywords",
    navDescription: "Organize SEO opportunities.",
    title:
      "Keyword list manager: save, tag and export the keywords worth acting on",
    description:
      "Keep useful keyword ideas organized so they can inform content planning, rank tracking decisions, and AI-agent workflows.",
    seoDescription:
      "Save keyword ideas with volume and difficulty attached, tag them by page or topic, and reuse the list for content plans, rank tracking and AI agents.",
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
          "Save ideas from keyword research, a competitor's domain overview or your Search Console queries, or paste in a list of your own.",
      },
      {
        title: "Organize by topic",
        description:
          "Tag keywords by page, campaign, content cluster, or priority, then filter the list by tag, volume, CPC, difficulty or the words a keyword contains.",
      },
      {
        title: "Reuse saved keywords across workflows",
        description:
          "Export the list to CSV or Google Sheets, or let an AI agent read and update it over MCP.",
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
      "Saving, tagging and exporting use no credits.",
    ],
    headings: {
      workflows: "Save it, tag it, use it again",
      useCases: "When the list earns its keep",
      differentiators: "Why keep the list next to the research",
      related: "Where saved keywords go next",
      faq: "Saved keyword questions",
    },
    toolCallout: {
      title: "Build the first draft of the list for free",
      description: "A free tool from OpenSEO. No signup required.",
      links: [
        {
          title: "Free keyword generator",
          description:
            "Type a topic and get up to 20 keyword ideas with search volume and difficulty: the first candidates for your list.",
          href: "/keyword-generator",
        },
      ],
    },
    contextSections: [
      {
        title: "Tag by the page you'll build, not the intent label",
        body: 'The keyword research page\'s example search for "keyword research" returned 300 ideas, and 45 of them contain the word "keyword". Tagged by the page each one belongs on, they make four pages and one pile to drop. 19 belong on a tool page, with 4,600 searches a month between them. Nine fit a how-to guide, five a definition page and two an examples page. The other ten use "keywords" in the academic sense, like "keywords in research". The intent column called 16 of the 19 tool-page keywords informational, including "free keyword research tool". Read the keyword, then tag it.',
      },
      {
        title: "Bring in a list you already have",
        body: "Paste up to 2,000 keywords at a time, one per line, or a CSV with keywords in the first column. Add a tag as you import, and choose whether to fetch volume, difficulty and CPC now. Fetching the numbers uses credits. Saving, tagging and exporting don't. Keywords are saved for the project's country and language, so the numbers match the market you're planning for.",
      },
      {
        title: "Hand the list to a writer, a developer or an AI agent",
        body: "Select keywords and export them to CSV or Google Sheets for a writer's brief or a client sheet. Your AI assistant can work with the same list over MCP: save keywords with their metrics and tags, read the list back filtered by tag, retag a group into page clusters, and remove what you no longer need. The list stays one source of truth whether a person or an agent did the research.",
      },
    ],
    contextImage: {
      src: "/features/saved-keywords/openseo-saved-keywords-tagged-by-page.png",
      alt: "Bar chart of 45 keyword ideas containing the word keyword, tagged by page: tool page 19 keywords and 4,600 monthly searches, how-to guide 9 and 930, definition guide 5 and 530, examples 2 and 220, other meanings 10 and 560. 16 of the 19 tool-page keywords carry an informational intent label.",
      caption:
        "One search, tagged by the page each keyword belongs on. The intent label alone would have hidden the tool page.",
      width: 1600,
      height: 900,
    },
    structuredData: true,
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
          "Research fills the list, tags group it into pages and campaigns, and the shortlist feeds rank tracking. Saved keywords are the bridge between finding an opportunity and acting on it.",
      },
      {
        question: "Can I export saved keywords?",
        answer:
          "Yes. Select keywords in the list and export them to CSV or Google Sheets, or copy them.",
      },
      {
        question: "Can I import a keyword list?",
        answer:
          "Yes. Paste up to 2,000 keywords at a time, or a CSV with keywords in the first column, and add a tag on the way in. Fetching volume, difficulty and CPC for them is optional and uses credits.",
      },
      {
        question: "Can an AI assistant add keywords to my list?",
        answer:
          "Yes. Through the OpenSEO MCP server, an assistant can save up to 100 keywords at a time with their metrics and tags, read the list back, and remove keywords you no longer need. Saving uses no credits.",
      },
    ],
  },
  aiBrandVisibility: {
    slug: FEATURE_PAGE_SLUGS.aiBrandVisibility,
    eyebrow: "AI Visibility",
    navDescription: "Research prompts and track mentions and citations.",
    title:
      "AI visibility tool: track your brand in ChatGPT, Gemini and Google AI answers",
    description:
      "Research prompts, then track brand mentions, cited pages, and competitor appearances in ChatGPT, Gemini, and Google AI Overviews.",
    seoDescription:
      "See where ChatGPT, Gemini and Google AI Overviews mention your brand, which pages they cite, and which competitors appear instead. Open source, $10/month.",
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
        title: "Research prompts",
        description:
          "Enter a keyword to find the questions people ask about it, with ChatGPT's answer and the sources it cites for each. Pick the questions worth tracking.",
      },
      {
        title: "Track answers over time",
        description:
          "Save up to 100 questions under topics, choose engines and a market, check the cost estimate, then run a check or schedule daily, weekly, or monthly collection.",
      },
      {
        title: "Review competitors and citations",
        description:
          "See which answers mention your brand, which cite your site, which competitors from your project appear instead, and which pages the answers are built on.",
      },
    ],
    metrics: [
      { label: "Mentions", value: "Presence" },
      { label: "Citations", value: "Sources" },
      { label: "Platforms", value: "Surfaces" },
      { label: "Cited domains", value: "Sources" },
    ],
    useCases: [
      "See whether tracked ChatGPT, Gemini, and Google AI Overviews answers mention your brand or cite your website.",
      "Find pages and domains cited alongside brand mentions.",
      "Use cited sources and prompts to plan content experiments for answer-engine visibility.",
    ],
    differentiators: [
      "AI visibility sits beside classic SEO research instead of replacing it.",
      "The workflow focuses on concrete sources and mentions, not vague AI hype.",
      "OpenSEO helps teams connect AI mention and citation research to concrete SEO planning.",
    ],
    headings: {
      workflows: "Find the questions, track the answers, read the sources",
      useCases: "When to check AI visibility",
      differentiators: "Why track AI answers next to your SEO data",
      related: "Where AI visibility research goes next",
      faq: "AI visibility questions",
    },
    contextSections: [
      {
        title: "What tracking costs",
        body: "Each check pays for one answer per question per engine. A scheduled answer from ChatGPT, Gemini, AI Overviews or AI Mode costs $0.002, so 50 questions on ChatGPT and Gemini, checked weekly, comes to $0.80 a month. Run now collects live answers from those four engines at $0.006 each. Perplexity costs $0.052 an answer and Claude $0.231, scheduled or not. The app shows the estimate before you start a check or a schedule, and reviewing or exporting saved results is free.",
      },
      {
        title: "Six AI engines, one tracker",
        body: "A tracker checks ChatGPT and Gemini by default. Add Google AI Overviews, Google AI Mode, Claude or Perplexity when you need them. ChatGPT and Gemini answers are collected from their consumer sites, the way a customer sees them. Claude and Perplexity have no consumer-site collection, so every check asks their model API at live API pricing. Each tracker holds up to 100 questions in up to 30 topics, and editing a question's wording starts a new question, so earlier answers keep the wording they were collected for.",
      },
      {
        title: "When your brand counts as mentioned or cited",
        body: "Your brand counts as mentioned when its name or domain appears in an answer, and as cited when the answer links to your site. The name comes from the brand name in your project context, or from the project name when that's blank. Competitors come from the same project context, so the tracker and your other research agree on who you compete with. A check that failed is not evidence your brand was absent.",
      },
    ],
    contextImage: {
      src: "/features/ai-brand-visibility/openseo-ai-visibility-tracking-monthly-cost.png",
      alt: "Grid of monthly costs to track 50 prompts. ChatGPT, Gemini, AI Overviews or AI Mode: $0.10 monthly, $0.40 weekly, $3.00 daily. Perplexity: $2.60, $10.40, $78.00. Claude: $11.55, $46.20, $346.50.",
      caption:
        "Monthly cost of 50 tracked prompts on one engine, by schedule. Orange cells fit inside the Base plan's $10 of usage.",
      width: 1600,
      height: 900,
    },
    structuredData: true,
    related: [
      { label: "AI Visibility Guide", href: "/docs/ai-visibility" },
      { label: "Prompt Explorer", href: "/features/ai-search-prompts" },
      { label: "Domain Overview", href: "/features/domain-overview" },
      { label: "OpenSEO MCP", href: "/features/mcp" },
    ],
    faqs: [
      {
        question: "What is AI brand visibility?",
        answer:
          "It describes brand mentions and website citations in the prompts, engines, and market you track. It does not measure every AI conversation or traffic to your site.",
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
      {
        question: "Which AI engines can OpenSEO track?",
        answer:
          "ChatGPT, Gemini, Google AI Overviews, Google AI Mode, Claude and Perplexity. ChatGPT and Gemini are selected by default.",
      },
      {
        question: "How much does AI visibility tracking cost?",
        answer:
          "A scheduled answer from ChatGPT, Gemini, AI Overviews or AI Mode costs $0.002, so 50 questions on two engines checked weekly is about $0.80 a month. Claude and Perplexity cost more because they're asked through their model APIs. Prompt research costs about $0.25 per keyword.",
      },
      {
        question: "Do I need a paid plan?",
        answer:
          "Tracking only needs credits. Prompt Research and Prompt Explorer need a paid plan on hosted OpenSEO.",
      },
    ],
  },
  aiSearchPrompts: {
    slug: FEATURE_PAGE_SLUGS.aiSearchPrompts,
    eyebrow: "Prompt Explorer",
    navDescription: "Compare answers across supported models.",
    title:
      "AI search prompt explorer: one prompt across ChatGPT, Claude, Gemini and Perplexity",
    description:
      "Start with ChatGPT, or add Claude, Gemini, and Perplexity to compare API model answers and available citations.",
    seoDescription:
      "Run one prompt through ChatGPT, Claude, Gemini and Perplexity, then compare the answers and any sources each model cites. Answers come from each model's API.",
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
          "Ask the questions your customers ask AI tools, up to 500 characters each, in one model or all four at once.",
      },
      {
        title: "Inspect web-backed answers",
        description:
          "With web search on, see the pages and domains each answer cites and the searches the model ran before it answered.",
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
      "Prompt Explorer lives beside Prompt Research and Prompt Tracking in your project.",
      "OpenSEO treats AI search as a research layer, not a replacement for SEO fundamentals.",
      "OpenSEO MCP lets your agent explore prompts and work with saved AI visibility results.",
    ],
    headings: {
      workflows: "Run a prompt, read the sources, check your brand",
      useCases: "When to run prompt research",
      differentiators: "Why prompt research belongs next to SEO",
      related: "Where prompt research goes next",
      faq: "Prompt Explorer questions",
    },
    contextSections: [
      {
        title: "Same question, four shortlists",
        body: 'We asked all four models "What is the best affordable SEO tool for a small business owner?" with web search on. ChatGPT, Claude and Perplexity all picked Mangools. Gemini listed SE Ranking first. Every model named Google Search Console, Semrush and Ahrefs, and none named OpenSEO. Their sources barely overlapped: 34 citations across the four answers, and only three sites cited by more than one model. ChatGPT\'s four searches all asked for official pricing pages. One run per model is a snapshot, so run a prompt more than once before you act on it.',
      },
      {
        title: "Four models, one prompt, side by side",
        body: "Prompt Explorer sends one prompt to ChatGPT, Claude, Gemini and Perplexity and lays the answers side by side. Web search is on by default, and you can pick the country it searches from (Gemini doesn't take one). Each answer comes back with the pages it cited, the searches the model ran, and whether your highlighted brand appears. Answers are saved for seven days, so running the same prompt with the same settings in the same project that week costs nothing.",
      },
      {
        title: "Explorer, research or tracking",
        body: "Use Prompt Explorer for a one-off look at how models answer a question. These are API answers, and they can differ from what a customer sees on ChatGPT's own site. Use Prompt Research to find which questions to ask, and Prompt Tracking to collect consumer-site answers on a schedule and watch them change. Your AI agent can run the same comparison over MCP; it asks ChatGPT unless you name other models.",
      },
    ],
    contextImage: {
      src: "/features/ai-search-prompts/openseo-prompt-explorer-four-model-shortlists.png",
      alt: "Dot matrix of the tools ChatGPT, Claude, Gemini and Perplexity named for one prompt about affordable SEO tools for a small business. Mangools is the top pick for ChatGPT, Claude and Perplexity; Gemini lists SE Ranking first. Google Search Console, Semrush and Ahrefs appear in all four answers. OpenSEO appears in none.",
      caption:
        "One prompt, four models, four different shortlists. OpenSEO wasn't named by any of them.",
      width: 1600,
      height: 900,
    },
    structuredData: true,
    related: [
      { label: "AI Visibility", href: "/features/ai-brand-visibility" },
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
          "Prompts are the new queries: they show the comparison, problem, and buying questions your customers now ask AI tools. The cited sources show which pages and domains those answers are built on, so you can see where your coverage is missing.",
      },
      {
        question: "Can this help with answer engine optimization?",
        answer:
          "Yes. Prompt Explorer is a starting point for mapping prompt responses and returned citations back to source pages and possible SEO follow-up work.",
      },
      {
        question: "Which AI models does Prompt Explorer support?",
        answer:
          "ChatGPT, Claude, Gemini and Perplexity. Run a prompt on one model or compare all four, with web search and a search country when you want cited sources.",
      },
      {
        question: "Do AI answers change between runs?",
        answer:
          "Yes. The same prompt can return a different answer or different sources on the next run. Run important prompts more than once before you draw a conclusion.",
      },
      {
        question: "How much does Prompt Explorer cost?",
        answer:
          "It needs a paid plan on hosted OpenSEO, and each new answer uses credits for the model usage. Answers are saved for seven days, so asking the same prompt with the same settings in the same project that week is free.",
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
      featurePages.backlinks,
      featurePages.siteAudit,
    ],
  },
  {
    label: "AI visibility",
    description: "Research AI search prompts, citations, and brand visibility.",
    pages: [featurePages.aiBrandVisibility, featurePages.aiSearchPrompts],
  },
] as const;
