import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/long-tail-question-mining.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";

const PATH = "/library/keyword-research/long-tail-question-mining";

const faqs = [
  {
    question: "What are long-tail keywords in SEO?",
    answer:
      "Specific multi-word queries with lower individual volume but higher combined traffic and clearer intent than head terms. They're the fastest way for a newer site to rank, because competition concentrates on head terms.",
  },
  {
    question: "How do I use long-tail keywords in content?",
    answer:
      "One intent per page. Make the long-tail query the H2 (or H1) verbatim where natural, answer it in the first paragraph, then earn depth below. Don't scatter twenty tails across one page; cluster related tails, then split by intent.",
  },
  {
    question: "Is there a free long-tail keyword generator?",
    answer:
      "Google gives you two: autocomplete and People Also Ask. Your Search Console is the third and best; it's your site's actual tail. OpenSEO connects your Search Console and expands what you find into full keyword lists. You can start for free; paid plans start at $10/month.",
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
  "/_marketing/library/keyword-research/long-tail-question-mining",
)({
  head: () =>
    buildPageSeo({
      title: "What Are Long-Tail Keywords? How to Find and Use Them",
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
        crumb="Long-tail & question mining"
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
