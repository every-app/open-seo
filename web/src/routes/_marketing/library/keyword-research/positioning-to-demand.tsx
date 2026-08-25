import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/positioning-to-demand.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";

const PATH = "/library/keyword-research/positioning-to-demand";

const faqs = [
  {
    question: "Should I invent a name for my category?",
    answer:
      "Only with a plan for the demand gap. An invented term has no search behind it on day one and may never earn any, so anything a stranger needs to find has to be findable through the vocabulary that already exists. Keep the invented term for the pitch, where you have someone's attention.",
  },
  {
    question: "What if my keyword has no search volume?",
    answer:
      "Treat it as a signal about the market rather than a limitation of the tool. Zero volume for a category term usually means people describe the problem differently, and the related terms that do have volume will show you how. Low volume is different from zero, and can be worth owning when the intent is strong.",
  },
  {
    question: "How do I find the words my customers use?",
    answer:
      "Sales calls, support tickets, and recorded interviews, which is the same source that produces good seed keywords. People describe problems in language that no keyword database originates, because the database only knows what has already been typed enough times to register.",
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
  "/_marketing/library/keyword-research/positioning-to-demand",
)({
  head: () =>
    buildPageSeo({
      title: "Does Your Positioning Have Search Demand Behind It?",
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
        crumb="Map positioning to real demand"
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
