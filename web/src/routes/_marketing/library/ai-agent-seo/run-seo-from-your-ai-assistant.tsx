import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/run-seo-from-your-ai-assistant.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { AI_AGENT_SEO_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/ai-agent-seo/run-seo-from-your-ai-assistant";

const faqs = [
  {
    question: "What is MCP in SEO?",
    answer:
      "The Model Context Protocol, a standard that lets an AI assistant call external tools and receive data. An SEO MCP server gives the assistant Search Console, keyword, SERP, backlink, rank tracking and audit data inside the conversation, so it can fetch and analyse instead of only writing from what you paste.",
  },
  {
    question: "Which AI assistants work with the OpenSEO MCP?",
    answer:
      "Claude Code, Claude Desktop, Codex and Cursor, through one server configuration. The docs carry the setup for each. Agent skills, which are SKILL.md files describing SEO workflows, install alongside it.",
  },
  {
    question: "Does using the MCP cost credits?",
    answer:
      "Search Console reads, URL inspection and audit reads use no credits. Calls that fetch from a data provider, such as keyword metrics, SERP results, domain and backlink data, and rank checks, use credits, and each tool states its cost before it runs. The hosted app includes credits with the $10 plan; self-hosted deployments pay their provider directly.",
  },
  {
    question: "Can an AI agent do SEO on its own?",
    answer:
      "It can fetch, filter, sort and draft on its own. It cannot tell a bot query from a human one, judge whether a ranking is worth having, or know what the business will act on. The workflows here keep a person at the steps where that judgement happens.",
  },
  {
    question: "What is the first thing to run after connecting the MCP?",
    answer:
      "Project setup, then a Search Console pull of queries at positions 4 to 20 with real impressions, with a filter that removes bot queries and junk. It costs nothing and it produces the list every other workflow starts from.",
  },
];

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

export const Route = createFileRoute(
  "/_marketing/library/ai-agent-seo/run-seo-from-your-ai-assistant",
)({
  head: () =>
    buildPageSeo({
      title: "Run SEO From Your AI Assistant: the MCP Workflow",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Run SEO from your AI assistant"
      path={PATH}
      library={AI_AGENT_SEO_LIBRARY}
    >
      <Content components={{ ...defaultMdxComponents }} />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
    </LibrarySpokePage>
  ),
});
