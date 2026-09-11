import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/technical-seo-audit-checklist.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { SITE_AUDIT_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/site-audit/technical-seo-audit-checklist";

const faqs = [
  {
    question: "What is included in a technical SEO audit?",
    answer:
      "At minimum: crawlability and access, status codes, canonical and indexability signals, titles and meta descriptions, heading structure, internal linking including broken links and orphan pages, duplicate content, image alt coverage, and server response time. OpenSEO checks 27 issue types across those areas and can optionally run Lighthouse on a sample of up to 10 pages for performance and accessibility findings.",
  },
  {
    question: "How often should you run a technical SEO audit?",
    answer:
      "Run one before and after any migration, template change, or platform upgrade, because those are the events that create critical issues. Outside of that, a quarterly crawl is enough for a stable site. Auditing monthly on a site nobody is changing produces the same report every month and trains everyone to ignore it.",
  },
  {
    question:
      "What is the difference between a technical SEO audit and an SEO audit?",
    answer:
      "A technical audit asks whether search engines can reach, render, and understand your pages. A broader SEO audit adds content quality, keyword coverage, and links. The technical layer comes first because a content problem on a page Google cannot fetch is not the problem you have.",
  },
  {
    question: "Why do SEO audits produce so many issues?",
    answer:
      "Because most issue types are page-level and most sites are templated, so a single template fault multiplies by the number of pages using it. A report of 1,180 issues across 318 pages usually describes a dozen underlying causes. Group by issue type before you count anything.",
  },
  {
    question: "Is there a free technical SEO audit tool?",
    answer:
      "Partly. Google Search Console reports coverage and indexing for your own verified property at no cost, and it is the more reliable source for anything Google-specific. A crawler adds the on-page and internal-link picture that Search Console does not give you. OpenSEO is open source and free to start, with 50-page crawls on the free plan and 10,000-page crawls on the $10/month plan.",
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
  "/_marketing/library/site-audit/technical-seo-audit-checklist",
)({
  head: () =>
    buildPageSeo({
      title: "The Technical SEO Audit Checklist That Ends in Fixes",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="The technical SEO audit checklist"
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
