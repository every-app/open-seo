import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/referring-domains.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { LINK_BUILDING_LIBRARY } from "@/lib/strategy-libraries";
import { brand } from "@/lib/brand";

const PATH = "/library/link-building/referring-domains";

const faqs = [
  {
    question: "What is the difference between backlinks and referring domains?",
    answer:
      "A backlink is one link from one page. A referring domain is one website that links to you, however many times. Two thousand backlinks can come from twenty sites. Referring domains is the count of distinct sources and the better measure of how many sites endorse yours.",
  },
  {
    question: "How many referring domains do I need?",
    answer:
      "Enough to match the pages that outrank you for the terms you want, from sites in the same field. Check the competitors' profiles for the number; a backlink gap analysis shows the domains that link to them and not to you.",
  },
  {
    question: "Are links from my own other websites worth anything?",
    answer:
      "A little, and less each time. They are real links, but a search engine can see common ownership and hosting, and the diversity that moves rankings comes from sites you do not control. Count them separately so they do not inflate the total.",
  },
  {
    question: "What is distance to seed?",
    answer:
      "The number of link hops between a site and the sites a search engine trusts most in a field. A link from a site that is itself cited by the industry's authorities is close to the seed and counts for more than a link from a high-scoring site in an unrelated field. You cannot see the seed list; you can judge whether a linking site is one your industry cites.",
  },
  {
    question: `Does ${brand.name} show referring domains?`,
    answer:
      "Yes. The backlinks overview reports the referring domain count and the top referring domains with their backlink count, rank, spam score and first-seen date, and the growth chart shows backlinks and referring domains over the last year. The free backlink checker shows the summary without an account.",
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
  "/_marketing/library/link-building/referring-domains",
)({
  head: () =>
    buildPageSeo({
      title: "Referring Domains, Not Backlinks: the Count That Moves Rankings",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: `${brand.name} Library`,
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Referring domains"
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
