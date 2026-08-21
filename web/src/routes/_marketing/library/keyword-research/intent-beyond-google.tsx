import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/intent-beyond-google.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";

const PATH = "/library/keyword-research/intent-beyond-google";

const faqs = [
  {
    question: "How do you do keyword research for Pinterest?",
    answer:
      "Use the platform's own search box and its guided-search suggestions, then place those terms in pin titles, pin descriptions, the text on the image, and your board and profile copy. Pinterest has to understand the account and the pin before it can match either to a query, so both levels need the vocabulary.",
  },
  {
    question: "Does SEO work for LinkedIn profiles?",
    answer:
      "Yes, and the profile matters more than the posting. The most frequent action on the platform is viewing a profile, so the headline and about section carry the weight a title tag carries on a website. Write them in the words a stranger would use for the problem you solve.",
  },
  {
    question: "How do you optimize for AI assistants?",
    answer:
      "Answer questions directly and completely enough to be quotable, and accept that queries an assistant can satisfy in a paragraph will return fewer clicks regardless of your rank. Weight your research toward queries needing a tool, a price, a login or a person, because those still send a visit.",
  },
  {
    question:
      "How do you measure traffic from platforms that send no referral data?",
    answer:
      "Watch branded search. Discovery on a closed platform tends to surface later as people searching your name, so a rising branded line in Search Console during a campaign is a useful directional signal.",
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
  "/_marketing/library/keyword-research/intent-beyond-google",
)({
  head: () =>
    buildPageSeo({
      title: "Keyword Research Beyond Google: Pinterest, LinkedIn and AI",
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
        crumb="Intent beyond Google"
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
