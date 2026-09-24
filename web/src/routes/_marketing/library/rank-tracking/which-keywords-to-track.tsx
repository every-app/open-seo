import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/which-keywords-to-track.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { RANK_TRACKING_LIBRARY } from "@/lib/strategy-libraries";
import { brand } from "@/lib/brand";

const PATH = "/library/rank-tracking/which-keywords-to-track";

const faqs = [
  {
    question: "How many keywords should I track for SEO?",
    answer:
      "Twenty to fifty for a typical small or mid-size site: the terms tied to pages that earn money, the striking-distance queries from Search Console, one or two brand terms as a control, and a couple of competitor terms. Track more only if someone will read the extra rows.",
  },
  {
    question: "Which keywords should I track first?",
    answer:
      "The ones Search Console already shows your site for at positions 4 to 20 with real impressions. They have demand, they are within reach of page one, and a position change will show up in clicks quickly enough to learn from.",
  },
  {
    question: "Should I track keywords I already rank number one for?",
    answer:
      "A few. Brand terms belong in the tracker as an early-warning control, and a term where you rank near the top with a low click-through rate is worth tracking for its SERP features, since a feature above your result explains the missing clicks better than the position does.",
  },
  {
    question: "Does it cost more to track more keywords?",
    answer:
      `Yes, in proportion. In ${brand.name} the cost of a check is the number of keywords times the number of devices times the depth of results inspected, and scheduled checks run through a cheaper queue than one-off live checks. The app shows an estimate before you add keywords or start a run. On the hosted app, rank checks use credits from a paid plan.`,
  },
  {
    question: "How often should I re-pick the keywords?",
    answer:
      "Quarterly for the striking-distance bucket, since those queries shift as pages move. The money-page bucket changes only when the business does.",
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
  "/_marketing/library/rank-tracking/which-keywords-to-track",
)({
  head: () =>
    buildPageSeo({
      title: "Which Keywords to Track, and How Many",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: `${brand.name} Library`,
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Which keywords to track"
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
