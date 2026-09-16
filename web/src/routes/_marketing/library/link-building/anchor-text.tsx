import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/anchor-text.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { LINK_BUILDING_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/link-building/anchor-text";

const faqs = [
  {
    question: "Does anchor text affect rankings?",
    answer:
      "Not measurably at the page level, in a study of 4,871 links across 25 sites: the overlap between anchor words and the linked page's queries had a correlation of 0.04 with clicks. The number of distinct linking sites had a correlation of 0.33. Anchor text describes a link; it does not appear to rank the destination.",
  },
  {
    question: "What is the best anchor text for backlinks?",
    answer:
      "Whatever the linking site would naturally write: your brand name, the page title, or a short description of the page. Exact-match keyword anchors do not show a measurable benefit and are the pattern that bought links follow.",
  },
  {
    question: "Is exact-match anchor text bad for SEO?",
    answer:
      "The same study found no penalty for pages with a high share of exact-match anchors, and no benefit. It is inert. The risk is that a profile made of exact-match anchors looks manufactured, which is a reason not to build one, not a reason to fear the ones that arrive on their own.",
  },
  {
    question: "Should I use branded anchor text?",
    answer:
      "As the default, yes, because it is what a natural profile looks like and there is evidence that sites reading as brands hold up better in core updates. As a tactic to lift a particular page for a particular query, no; the branded share of a page's anchors did not predict its non-brand traffic.",
  },
  {
    question: "Does OpenSEO show anchor text?",
    answer:
      "Yes. Every backlink row carries the anchor text, the source page, the target page, dofollow or nofollow, domain rank and spam score, and the table can be filtered and exported.",
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
  "/_marketing/library/link-building/anchor-text",
)({
  head: () =>
    buildPageSeo({
      title: "Anchor Text: What 4,871 Links Said About the Words in the Link",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Anchor text"
      path={PATH}
      library={LINK_BUILDING_LIBRARY}
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
