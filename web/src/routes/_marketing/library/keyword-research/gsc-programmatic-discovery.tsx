import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/gsc-programmatic-discovery.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";

const PATH = "/library/keyword-research/gsc-programmatic-discovery";

const faqs = [
  {
    question: "Can you use Google Search Console for keyword research?",
    answer:
      "Yes, and it is the most reliable source you have, because it reports queries that reached your site rather than estimating a market. Its limits are that it only shows terms you already rank for, and it hides queries below a privacy threshold. Use it for expansion and validation, and use a keyword tool for the demand you have not captured yet.",
  },
  {
    question: "What are striking-distance keywords?",
    answer:
      "Queries where you rank roughly between positions 11 and 30. They sit on page two, earn few clicks, and demonstrate that Google already treats your page as a plausible answer. They are the cheapest rankings to improve on most sites.",
  },
  {
    question: "How far back does Google Search Console data go?",
    answer:
      "Sixteen months. Most exports default to a far shorter window, so pulling the full range surfaces seasonal queries and historical rankings that a 90-day view hides.",
  },
  {
    question: "Why don't the clicks in the query table add up to the total?",
    answer:
      "Google anonymizes queries that too few people searched, so they never appear by name while their clicks still count in the total. The shortfall runs from a small fraction to most of the total depending on the size of the site. Reading the same pages at page level rather than query level recovers much of the count.",
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
  "/_marketing/library/keyword-research/gsc-programmatic-discovery",
)({
  head: () =>
    buildPageSeo({
      title: "Search Console Keyword Research: Striking-Distance Queries",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <>
      <LibrarySpokePage
        title={frontmatter.title}
        description={frontmatter.description}
        crumb="Programmatic discovery with Search Console"
        path={PATH}
      >
        <Content components={{ ...defaultMdxComponents }} />
      </LibrarySpokePage>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
    </>
  ),
});
