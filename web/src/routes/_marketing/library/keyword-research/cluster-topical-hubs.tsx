import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/cluster-topical-hubs.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";

const PATH = "/library/keyword-research/cluster-topical-hubs";

const faqs = [
  {
    question: "What's the best keyword clustering tool?",
    answer:
      "For SERP-overlap clustering at scale, paid tools exist, but for most sites, OpenSEO's research + an intent-grouping pass (the MCP prompt above) covers it. Judge tools by whether they cluster on SERP overlap; word-similarity clustering is a toy.",
  },
  {
    question: "Is there a free keyword clustering tool?",
    answer:
      "Not an unlimited one. The grouping step itself is free (the MCP prompt above does it), but it runs on researched keywords, and quality keyword data is the part that costs money everywhere. OpenSEO includes the clustering pass with research, so there's no separate clustering tool to buy; you can start for free, and paid plans start at $10/month.",
  },
  {
    question: "What is a keyword mapping template?",
    answer:
      "A sheet with one row per cluster: primary keyword, supporting keywords, intent, target URL, status. The keyword map above is the working example; copy the structure. Add a forecast column and it becomes a build order: size each cluster before you commit the quarter.",
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
  "/_marketing/library/keyword-research/cluster-topical-hubs",
)({
  head: () =>
    buildPageSeo({
      title:
        "Keyword Clustering: Turn a Keyword List into Topical Hubs (and Fix Cannibalization)",
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
        crumb="Cluster keywords into topical hubs"
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
