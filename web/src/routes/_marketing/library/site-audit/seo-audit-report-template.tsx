import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/seo-audit-report-template.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { SITE_AUDIT_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/site-audit/seo-audit-report-template";

const faqs = [
  {
    question: "What should be in an SEO audit report?",
    answer:
      "Scope and crawl reliability, the critical issues with named owners and exact fixes, warnings grouped by underlying cause rather than by URL, an estimate of what each group costs in the client's own metric, a prioritised proposal, and a short measurement plan with dates. Raw findings go in an appendix.",
  },
  {
    question: "How long should an SEO audit report be?",
    answer:
      "The body should be short enough to read in a meeting, which in practice means four to eight pages. Length lives in the appendix. A long body signals that the findings were not triaged, which is the work the client is paying for.",
  },
  {
    question: "Should an SEO audit report include a score?",
    answer:
      "Not a composite one. A single number out of 100 invites an argument about the weighting and displaces the conversation about which fixes get scheduled. Report counts by severity, which are checkable, and let the proposal carry the judgement. Lighthouse category scores are fine to include as long as you say how many pages they cover.",
  },
  {
    question: "How do you present SEO audit findings to a client?",
    answer:
      "Lead with the decision you want, not the evidence you gathered. Open with the proposal and the cost, keep the critical issues as a forwardable list, group everything else by cause, and put the full export behind a link. Say plainly which numbers are estimates.",
  },
  {
    question: "Is there a free SEO audit report template?",
    answer:
      "The structure on this page is the template, and it is more useful than a formatted document because it tells you what goes in each section and what to leave out. OpenSEO can produce every section from a real crawl using the prompt above; it is open source and free to start, with paid plans from $10/month for larger crawls.",
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
  "/_marketing/library/site-audit/seo-audit-report-template",
)({
  head: () =>
    buildPageSeo({
      title: "SEO Audit Report Template: Structure That Gets Actioned",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Write an audit report the client will act on"
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
