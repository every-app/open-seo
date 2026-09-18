import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/how-to-get-backlinks.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { LINK_BUILDING_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/link-building/how-to-get-backlinks";

const faqs = [
  {
    question: "How do I get backlinks for a new website?",
    answer:
      "Start with the businesses that share your customer and do not compete with you: partners, suppliers, the tools your customers use, the communities they belong to. Ask for a mention where it helps their reader. Then build one thing worth linking to, a tool or a piece of data, and tell the ten people most likely to use it.",
  },
  {
    question: "What is a linkable asset?",
    answer:
      "A page that does something for another site's reader that a paragraph of prose cannot: a calculator, a template, a dataset, a checklist, a tool. On the site above, a traffic calculator has links from 17 domains; no article on the site has more than 10.",
  },
  {
    question: "Does link building outreach still work?",
    answer:
      "Personal outreach to a short list works. The podcast's host once got ten links from ten handwritten letters. Mass email to a purchased list mostly produces replies from people selling links, and those are the links that show up in an audit with spam scores in the 60s.",
  },
  {
    question: "Should I buy backlinks?",
    answer:
      "No. The sellers who email you produce links from casino and PBN domains that search engines ignore and that make your profile look manufactured. Practitioners on the podcast also warn that AI search systems may not forgive a manipulated profile the way Google eventually did.",
  },
  {
    question: "How does OpenSEO help with link building?",
    answer:
      "The backlinks tool shows which of your pages attract links and from where, which is the starting point above. It shows the same for any competitor, so you can list the domains that link to them and not to you. Use the app’s Top Pages table to compare referring-domain counts by page; the MCP provides backlink summaries and individual backlink rows. The link-prospecting skill packages the competitor workflow.",
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
  "/_marketing/library/link-building/how-to-get-backlinks",
)({
  head: () =>
    buildPageSeo({
      title:
        "How to Get Backlinks: Start From the Pages That Already Earn Them",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="How to get backlinks"
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
