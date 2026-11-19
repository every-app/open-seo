import { createFileRoute } from "@tanstack/react-router";
import { SeoReportTool } from "@/components/seo-report-tool";
import { ToolFrame } from "@/lib/free-tools/tool-frame";
import { freeTools } from "@/lib/free-tools/tool-pages";
import { buildPageSeo } from "@/lib/seo";

const TOOL = freeTools["seo-report"];

export const Route = createFileRoute("/_marketing/seo-report")({
  // `?site=example.com` prefills the website. Plain links still work.
  validateSearch: (search: Record<string, unknown>): { site?: string } =>
    typeof search.site === "string" ? { site: search.site } : {},
  head: () =>
    buildPageSeo({
      title: "Free SEO Report: Keywords and Pages for Your Website",
      description:
        "Enter your website and get a written SEO report by email: who your customer is, the keywords they search, who ranks for them, and the pages to build.",
      path: TOOL.path,
      titleSuffix: "OpenSEO",
    }),
  component: SeoReportPage,
});

const FAQS = [
  {
    question: "What is in the report?",
    answer:
      "Who your customer is and what they are trying to get done when they search. The keywords they type, grouped into families that one page can answer, with monthly searches and difficulty for each. Who holds page one of Google for every family, and where your site ranks. Then three to five pages to create or rework, best first.",
  },
  {
    question: "How long does it take?",
    answer:
      "About five minutes. Only a few reports are written at once, so at busy times yours waits in line and arrives later the same day.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "Search volumes, keyword difficulty, and Google results come from DataForSEO, the same source OpenSEO uses. The report covers Google in the United States, in English. Every number is an estimate.",
  },
  {
    question: "Who writes it?",
    answer:
      "An AI model writes it, working from your site's public pages and the search data. Nobody reads it before it is sent, so check its findings against what you know about your customers.",
  },
  {
    question: "How many reports can I ask for?",
    answer:
      "One a day for each email address. A site that already has a recent report gets that report's link.",
  },
  {
    question: "Can I keep my site out of this?",
    answer:
      "Yes. The report reader obeys robots.txt under the name openseo-reports, and you can email support@openseo.so to stop reports about your site.",
  },
];

const HIGHLIGHTS = [
  {
    title: "Your customer's searches",
    description:
      "The keywords your customers type, measured and grouped into families, each with monthly searches and difficulty.",
  },
  {
    title: "Who ranks today",
    description:
      "The sites on page one of Google for each family, and where your site sits, if it ranks at all.",
  },
  {
    title: "Pages to build",
    description:
      "Three to five pages to create or rework, best first, with the format page one rewards.",
  },
];

function SeoReportPage() {
  const { site } = Route.useSearch();

  return (
    <ToolFrame
      tool={TOOL}
      heading="Free SEO Report"
      subhead="Enter your website and we'll email you a written report: the keywords your customers search, who ranks for them, and the pages to build."
      highlights={HIGHLIGHTS}
      faqs={FAQS}
      cta={{
        heading: "Act on the report",
        body: "Track your rankings for the report's keywords and research more in OpenSEO. Start with free trial credits.",
        featureLabel: "Learn about Keyword Research",
      }}
    >
      <SeoReportTool initialSite={site} />
    </ToolFrame>
  );
}
