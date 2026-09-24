import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/what-to-automate.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { AI_AGENT_SEO_LIBRARY } from "@/lib/strategy-libraries";
import { brand } from "@/lib/brand";

const PATH = "/library/ai-agent-seo/what-to-automate";

const faqs = [
  {
    question: "What SEO tasks can be automated?",
    answer:
      "Anything with a fixed input and output and no judgement: scheduled rank checks, Search Console pulls, site audits started on a fixed day, data exports. An agent can add a second layer, summarising and drafting from that data, as long as a person reads the result. Choosing what to track, what to build and what to tell a client stays with a person.",
  },
  {
    question:
      "What is the difference between SEO automation and an AI SEO agent?",
    answer:
      "Automation runs the same job on a schedule with no model involved, like a weekly rank check. An agent takes variable input and produces structured output using a language model, like reading the check and writing the summary. Many products sold as agents are a schedule plus a prompt; that is useful, but it still needs a reader.",
  },
  {
    question: "Can I automate SEO reporting?",
    answer:
      "The data collection, yes: the tracker and Search Console pulls run on their own and use no credits to read. The draft, yes, with an agent and a saved prompt. The sentence that says what it means for the business should still be written or at least read by a person before it goes out.",
  },
  {
    question: `How much does scheduled rank tracking cost in ${brand.name}?`,
    answer:
      "The app estimates before anything runs. As a reference, 25 keywords on mobile checking the top 40 results weekly comes to about $0.25 a month in credits; 100 keywords about a dollar. Scheduled checks go through a queue that is cheaper than one-off live checks. Rank checks on the hosted app use credits from a paid plan.",
  },
  {
    question: "Should I automate content production?",
    answer:
      "Not end to end. The strategy on [human in the loop content](/library/ai-agent-seo/human-in-the-loop-content) covers the split that works: a person writes the brief, the agent drafts, a person edits. Automating the brief or the edit produces content that reads like every other automated site.",
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
  "/_marketing/library/ai-agent-seo/what-to-automate",
)({
  head: () =>
    buildPageSeo({
      title: "What to Automate and What to Keep: the Dispatcher Rule",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: `${brand.name} Library`,
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="What to automate"
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
