import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/seed-from-conversation.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";

const PATH = "/library/keyword-research/seed-from-conversation";

const faqs = [
  {
    question: "How do I do keyword research for free?",
    answer:
      "Conversations for seeds (this page), Google autocomplete + People Also Ask for expansion, Search Console for validation. OpenSEO validates and expands what those surface; you can start for free, and paid plans start at $10/month.",
  },
  {
    question: "How do I find LSI keywords?",
    answer:
      '"LSI keywords" is tool-industry vocabulary for related phrasings. The fastest free sources are the People Also Ask box and the "related searches" footer. Better still: your customers\' own synonyms, which is exactly what conversation seeding harvests.',
  },
  {
    question: "How many seed keywords do I need?",
    answer:
      "5–15 strong seeds per topic. Past that you're expanding, not seeding. Feed them into the long-tail mining strategy next. The same customer vocabulary is worth pointing at your own positioning: see whether anyone searches for what you call yourself.",
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
  "/_marketing/library/keyword-research/seed-from-conversation",
)({
  head: () =>
    buildPageSeo({
      title:
        "Seed Keywords from Customer Conversations (Keyword Research Without a Paid Tool)",
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
        crumb="Seed from conversation"
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
