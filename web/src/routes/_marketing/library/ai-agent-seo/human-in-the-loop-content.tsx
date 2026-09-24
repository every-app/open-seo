import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/human-in-the-loop-content.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { AI_AGENT_SEO_LIBRARY } from "@/lib/strategy-libraries";
import { brand } from "@/lib/brand";

const PATH = "/library/ai-agent-seo/human-in-the-loop-content";

const faqs = [
  {
    question:
      "How do I use AI for SEO content without producing generic pages?",
    answer:
      "Write the brief yourself: the reader, the one thing they should do, your own data, verbatim quotes, and what not to claim. Let the model draft from that. Then run a fact pass against the brief and a pass for machine-writing phrases before anything ships. Every skipped step shows in the result.",
  },
  {
    question: "Should AI write the brief or the draft?",
    answer:
      "The draft. A brief written by a model contains only what the model already knew, which is what every competing page already says. A brief written by a person carries the data and quotes that make the page different. The draft is labour; the brief is knowledge.",
  },
  {
    question: "What is human in the loop content?",
    answer:
      "A workflow where a person owns the two ends, briefing and editing, and a model does the middle. It is the opposite of the common pattern where the model briefs and edits while a person writes, which produces polished pages with nothing in them.",
  },
  {
    question: "How do I check an AI draft?",
    answer:
      `Two passes. Fact: every number, quote and product claim traces to the brief or the source. Slop: remove the phrases and structures that mark machine writing, such as filler openers, false contrasts and stacked rhetorical questions. ${brand.name} keeps a catalogue of both in its repository and runs it on every page.`,
  },
  {
    question: `Does ${brand.name} write content?`,
    answer:
      "No. The MCP pulls the data half of a brief: Search Console performance, keyword metrics, SERP results, competitors, audit findings. The assistant you connect writes from the brief you complete. The product's own pages follow the same loop and the review rules are public in its repository.",
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
  "/_marketing/library/ai-agent-seo/human-in-the-loop-content",
)({
  head: () =>
    buildPageSeo({
      title: "Human in the Loop Content: the Brief Is the Job",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: `${brand.name} Library`,
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Human in the loop content"
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
