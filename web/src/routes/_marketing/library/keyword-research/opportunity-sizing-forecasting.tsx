import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/opportunity-sizing-forecasting.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";

const PATH = "/library/keyword-research/opportunity-sizing-forecasting";

const faqs = [
  {
    question: "How accurate is SEO forecasting?",
    answer:
      "Directionally useful and precisely wrong, which is why the output should be a range. Volume figures are estimates, CTR curves are averages across wildly different SERPs, and ranking timelines depend on competitors who are also working. Forecast to compare opportunities against each other, not to promise a number.",
  },
  {
    question: "What is a good SEO ROI?",
    answer:
      "It depends on conversion value and payback window rather than a benchmark. The useful calculation is cost of the content and links against forecast revenue over 12 months, and whether that beats what the same budget would return in paid. SEO usually loses that comparison in month one and wins it by month nine, so the timeline matters as much as the multiple.",
  },
  {
    question: "Which SEO KPIs matter?",
    answer:
      "Leads and revenue are the two numbers a business treats as exact. Everything else, including rankings, sessions and impressions, is diagnostic: useful for explaining why the exact numbers moved, weak as a target in its own right.",
  },
  {
    question: "How do you calculate potential traffic from keywords?",
    answer:
      "Combined cluster volume, times the CTR for your expected position, gives estimated sessions. Multiply by conversion rate and conversion value for revenue. Run it three times at three positions so you finish with a range rather than a single figure nobody should trust.",
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
  "/_marketing/library/keyword-research/opportunity-sizing-forecasting",
)({
  head: () =>
    buildPageSeo({
      title: "SEO Forecasting: Size a Keyword Opportunity Before You Build",
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
        crumb="Opportunity sizing & forecasting"
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
