import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/index-bloat.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { SITE_AUDIT_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/site-audit/index-bloat";

const faqs = [
  {
    question: "How do I know if my site has index bloat?",
    answer:
      "Compare the number of URLs you want indexed against the indexed count in Search Console's page indexing report. A large gap is the signal. Then inspect a sample of the surplus URLs, because a crawler can show you hundreds of near-duplicate pages that Google never fetched, which is not bloat.",
  },
  {
    question: "Does index bloat hurt rankings?",
    answer:
      "It can, at scale, when a large share of a domain's pages are thin or duplicated and the domain gets assessed as a whole. On a site of a few hundred pages the more common effects are wasted crawling and internal link equity spread across URLs that were never going to rank. Neither is urgent on its own.",
  },
  {
    question: "Should I noindex or delete duplicate pages?",
    answer:
      "Use noindex when the page has a purpose for users, such as a filtered listing or a paginated archive. Use a 410 or a 301 when the page has no purpose at all. Removing a URL from the sitemap alone does not deindex it; it only stops you asking for indexing.",
  },
  {
    question: "How many pages should a website have indexed?",
    answer:
      "As many as there are distinct things worth ranking, which for most small business sites is dozens rather than thousands. The count matters less than the ratio: if most of your indexed URLs get no impressions in a year, the set is larger than the site can support.",
  },
  {
    question: "Can a site audit tool find index bloat?",
    answer:
      "Not directly, because every bloated page returns 200 and passes its per-page checks. What a crawler gives you is the raw material, repeated titles, thin word counts, and recurring URL patterns. Pair it with Search Console URL inspection to find out which of those URLs Google holds. OpenSEO does both: crawls up to 50 pages on the free plan and 10,000 on the $10/month plan, and runs URL inspection against your connected property at no credit cost.",
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
  "/_marketing/library/site-audit/index-bloat",
)({
  head: () =>
    buildPageSeo({
      title: "Index Bloat: When the Fix Is Deleting Pages",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Index bloat"
      path={PATH}
      library={SITE_AUDIT_LIBRARY}
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
