import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/search-intent-mapping.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";

const PATH = "/library/keyword-research/search-intent-mapping";

const faqs = [
  {
    question: "Why is search intent important for SEO?",
    answer:
      "Because Google ranks pages that satisfy intent, not pages that mention keywords. A perfectly optimized page against the wrong intent can't win. Read the SERP and you'll see the intent Google has decided the query carries.",
  },
  {
    question: "What are buyer intent keywords?",
    answer:
      'Queries that signal purchase readiness: "pricing", "vs", "alternative", "best X for Y", "discount". They\'re low volume and high competition per click, but still usually your best ROI, because the searcher arrives pre-sold.',
  },
  {
    question: "How do I check the search intent of a keyword?",
    answer:
      "Search it. The current top 10 is Google's answer: if it's all listicles, the intent is commercial comparison; all docs and definitions, informational. OpenSEO also auto-labels intent on researched keywords in most countries.",
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
  "/_marketing/library/keyword-research/search-intent-mapping",
)({
  head: () =>
    buildPageSeo({
      title: "What Is Search Intent? Mapping Keywords Hot, Warm, and Cold",
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
        crumb="Search-intent mapping"
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
