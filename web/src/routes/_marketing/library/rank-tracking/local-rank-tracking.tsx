import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/local-rank-tracking.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { RANK_TRACKING_LIBRARY } from "@/lib/strategy-libraries";
import { brand } from "@/lib/brand";

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
      "Nine, spaced to cover the area you serve, is enough to see the shape. Use twenty-five when you are making a location decision. Beyond that you are paying for resolution you will not act on.",
  },
  {
    question:
      "Should a service-area business set up a service area or an address on Google?",
    answer:
      "Use the settings that match how you serve customers. An eligible storefront that also visits or delivers to customers can show both an address and a service area. If customers do not visit your address, hide it and list your service area.",
  },
  {
    question: `Does ${brand.name} do local rank tracking?`,
    answer:
      "Yes. The MCP local rank grid measures Business Profile positions in Maps. Scheduled rank trackers measure organic website rankings from a chosen location. Both use credits. On the hosted app, scheduled and live rank-tracker checks require the $10/month plan, which includes $10 of credits.",
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
      titleSuffix: `${brand.name} Library`,
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
