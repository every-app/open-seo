import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/local-rank-tracking.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { RANK_TRACKING_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/rank-tracking/local-rank-tracking";

const faqs = [
  {
    question:
      "Why do my local rankings look different on my phone and my colleague's?",
    answer:
      "Because you are standing in different places, or Google thinks you are. Proximity is one of the strongest signals for local queries, so two searchers a few kilometres apart routinely see different map packs. A tracker that checks from one point reports one of those views.",
  },
  {
    question: "What is a local rank grid?",
    answer:
      "A set of searches run from points on a grid around a location, usually 3x3 or 5x5, reporting where a business ranks at each point. It shows how far a business's visibility reaches and where competitors take over, which a single rank check cannot.",
  },
  {
    question: "How many points should a local rank grid have?",
    answer:
      "Nine, spaced to cover the area you actually serve, is enough to see the shape. Use twenty-five when you are making a location decision. Beyond that you are paying for resolution you will not act on.",
  },
  {
    question:
      "Should a service-area business set up a service area or an address on Google?",
    answer:
      "Whichever is true. A storefront that lists a service area dilutes the proximity signal it would have had at its address. A business that genuinely travels to customers has to use a service area, and should build location pages on its site for the places it serves.",
  },
  {
    question: "Does OpenSEO do local rank tracking?",
    answer:
      "Yes. Each rank tracker takes a location, so you can track the same keywords from several towns, and the MCP includes a local rank grid tool that runs one Maps search per grid point. Grid searches and rank checks use credits, and the app shows the cost before either runs; on the hosted app they need the $10/month plan, which includes $10 of credits.",
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
  "/_marketing/library/rank-tracking/local-rank-tracking",
)({
  head: () =>
    buildPageSeo({
      title:
        "Local Rank Tracking: Position Depends on Where the Searcher Stands",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Local rank tracking"
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
