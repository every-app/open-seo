import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/search-console-vs-rank-tracker.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { RANK_TRACKING_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/rank-tracking/search-console-vs-rank-tracker";

const faqs = [
  {
    question: "Is Google Search Console a rank tracker?",
    answer:
      "Not in the usual sense. It reports an average position per query or page, blended across devices, countries, and dates, for your own verified site only. Its 24-hour view shows recent preliminary data; finalized reports arrive later. A rank tracker records one position per keyword, device, and location on a schedule, and can include sites you do not own.",
  },
  {
    question: "Why does my Search Console position not match the rank tracker?",
    answer:
      "Because they measure different things. Search Console averages your best position across every impression in the period, so a term that is 3 in one state and 15 elsewhere reports as something in between. A tracker reports the position from one place on one device on one day. A gap of several positions between them is normal.",
  },
  {
    question: "How accurate is Search Console average position?",
    answer:
      "It is Google's own count of where your result appeared, so the impressions and clicks are as accurate as any data you will get. The position is accurate as an average; it is not a rank. Filter by device and country and the average becomes much closer to what a searcher sees.",
  },
  {
    question: "How do I check keyword rankings for free?",
    answer:
      "Open Search Console, go to Performance, filter to the page or query you care about, and switch on the average position metric. Filter to a single device and country to make the number meaningful. That covers your own site; for a competitor's rankings you need a tool that fetches results, which costs money wherever you do it.",
  },
  {
    question: "Does OpenSEO use credits to read Search Console?",
    answer:
      "No. Search Console and URL inspection reads are free in OpenSEO, in the app and through the MCP. Rank tracking checks use credits because they fetch live results, and on the hosted app they require the $10/month plan, which includes $10 of credits.",
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
  "/_marketing/library/rank-tracking/search-console-vs-rank-tracker",
)({
  head: () =>
    buildPageSeo({
      title: "Is Search Console a Rank Tracker? Where the Free Data Stops",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Search Console vs a rank tracker"
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
