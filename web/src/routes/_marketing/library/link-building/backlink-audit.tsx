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
      "Pull the full profile with one row per referring domain, sorted by first seen. Bucket rows into junk, broken or lost, nofollow, and worth reading. Redirect the broken target pages. Then read the worth-reading rows one at a time, asking whether a person on that page would have a reason to click through.",
  },
  {
    question: "What is a toxic backlink?",
    answer:
      "A link from a page that exists only to sell or host links: link seller listings, PBN adverts, casino and pharmacy domains, and pages with hundreds of unrelated outbound links. They tend to have high spam scores and anchor text that reads like an advert. Google generally ignores them.",
  },
  {
    question: "Should I disavow toxic backlinks?",
    answer:
      "Only if the site has a manual action, or you know links were bought and want them gone. For links that simply arrived, Google's position is that it ignores them, and practitioners who have tested mass disavows report no visible change. Build the file from the junk bucket at the domain level if you do it at all.",
  },
  {
    question: "Is domain rank or DA a good measure of a backlink?",
    answer:
      "It is a sorting aid, not a verdict. A spam domain can carry a higher rank than a relevant small site. Use the score to order the list, then judge each link on whether the linking page is about the same thing as yours and whether a real site published it.",
  },
  {
    question: "Does OpenSEO show broken and lost backlinks?",
    answer:
      "Yes. The backlinks overview reports broken backlinks and broken target pages, and each row in the profile carries lost and broken status, dofollow or nofollow, domain rank, spam score and first-seen date. The free backlink checker shows the summary and top 15 links without an account.",
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
