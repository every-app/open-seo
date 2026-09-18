import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/backlink-audit.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { LINK_BUILDING_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/link-building/backlink-audit";

const faqs = [
  {
    question: "How do I do a backlink audit?",
    answer:
      "Start with a page of backlink rows, one per referring domain, sorted by first seen, with spam filtering off. Sort them into suspected junk, broken targets, nofollow, and worth reading. Check broken pages before restoring them or choosing a relevant redirect. Read the remaining rows and decide whether a person on the source page would have a reason to click through.",
  },
  {
    question: "What is a toxic backlink?",
    answer:
      "A link from a page that exists only to sell or host links: link seller listings, PBN adverts, casino and pharmacy domains, and pages with hundreds of unrelated outbound links. They tend to have high spam scores and anchor text that reads like an advert. Google generally ignores them.",
  },
  {
    question: "Is domain rank or DA a good measure of a backlink?",
    answer:
      "It is a sorting aid, not a verdict. A spam domain can carry a higher rank than a relevant small site. Use the score to order the list, then judge each link on whether the linking page is about the same thing as yours and whether a real site published it.",
  },
  {
    question: "Does OpenSEO show broken backlinks?",
    answer:
      "The overview reports broken backlinks and broken target pages. Profile rows include broken status, dofollow or nofollow, domain rank, spam score and first-seen date. The profile request used here returns live backlinks, so it cannot list lost links. The free backlink checker shows the summary and top 15 links without an account.",
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
  "/_marketing/library/link-building/backlink-audit",
)({
  head: () =>
    buildPageSeo({
      title: "The Backlink Audit: Sort by First Seen, Then by Relevance",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Backlink audit"
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
