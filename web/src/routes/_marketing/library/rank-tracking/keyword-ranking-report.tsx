import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/keyword-ranking-report.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { RANK_TRACKING_LIBRARY } from "@/lib/strategy-libraries";
import { brand } from "@/lib/brand";

const PATH = "/library/rank-tracking/keyword-ranking-report";

const faqs = [
  {
    question: "What should an SEO ranking report include?",
    answer:
      "The business metric for the tracked pages against the prior period, ranking movement as four counts (entered top 3, entered page 1, left page 1, unchanged), the three rows that explain the movement with SERP features noted, a brand and non-brand split, and a short list of work done and planned. The full keyword table goes in an attachment.",
  },
  {
    question: "How often should I send a ranking report?",
    answer:
      "Monthly for most businesses, weekly if a launch or migration is in progress. The tracker can check daily; the report should not, because week-to-week ranking noise is real and reporting it trains the reader to ignore the report.",
  },
  {
    question: "Should a ranking report show average position?",
    answer:
      "Not across all keywords. It is a mean of unrelated queries, changes whenever the list changes, and means nothing to a non-SEO reader. Report positions per keyword for the few rows that matter and movement counts for the rest.",
  },
  {
    question: "How do I explain a ranking drop to a client or manager?",
    answer:
      "Name the keyword, the previous and current position, the URL, and what is now on the results page, then say what you are doing about it. If the position held and clicks fell, show the SERP feature that took the click. A drop with a cause and a plan is a normal report; a drop with neither is a problem.",
  },
  {
    question: `Can ${brand.name} generate a ranking report?`,
    answer:
      "It provides the pieces: tracked positions with previous positions and SERP features, Search Console clicks by page and query at no credit cost, and an MCP so an assistant can assemble the report from a prompt like the one above. It does not produce a composite score, on purpose.",
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
  "/_marketing/library/rank-tracking/keyword-ranking-report",
)({
  head: () =>
    buildPageSeo({
      title: "The Keyword Ranking Report Your CEO Will Read",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: `${brand.name} Library`,
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Keyword ranking report"
      path={PATH}
      library={RANK_TRACKING_LIBRARY}
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
