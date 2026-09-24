import { createFileRoute } from "@tanstack/react-router";
import { CompetitorAnalysisTool } from "@/components/competitor-analysis-tool";
import { ToolFrame } from "@/lib/free-tools/tool-frame";
import { freeTools } from "@/lib/free-tools/tool-pages";
import { buildPageSeo } from "@/lib/seo";
import { brand } from "@/lib/brand";

const TOOL = freeTools["competitor-analysis"];

export const Route = createFileRoute("/_marketing/competitor-analysis")({
  head: () =>
    buildPageSeo({
      title: "Free SEO Competitor Analysis Tool",
      description:
        "See a competitor's top organic keywords and pages, compare their traffic to yours, and find the keywords they rank for that you don't. No signup, no email.",
      path: TOOL.path,
      titleSuffix: brand.name,
      imageAlt: `${brand.name} free SEO competitor analysis tool`,
    }),
  component: CompetitorAnalysisPage,
});

const FAQS = [
  {
    question: "How many keywords does the free tool show?",
    answer:
      "The competitor's top 20 organic keywords by estimated traffic, their top 10 pages, and up to 20 keywords they rank for that you don't. The report tells you how many keywords are in the index in total.",
  },
  {
    question: "Do I have to enter my own domain?",
    answer:
      "No. Without it you get the competitor's keywords and pages. Add your domain and you also get a side-by-side traffic comparison and the keyword gap between you.",
  },
  {
    question: "Where does the data come from?",
    answer:
      `DataForSEO's Labs index, the same source behind ${brand.name}'s competitor research. Traffic figures are modelled estimates, not the competitor's analytics.`,
  },
  {
    question: "Which competitor should I check?",
    answer:
      "Choose a site that ranks for keywords relevant to your business. It may differ from the competitors you encounter in sales.",
  },
];

const HIGHLIGHTS = [
  {
    title: "Their best keywords",
    description:
      "The top 20 keywords a competitor ranks for, with search volume, difficulty, position, and the URL that ranks.",
  },
  {
    title: "Their best pages",
    description:
      "The 10 pages with the highest estimated organic traffic, so you can see which content brings visitors.",
  },
  {
    title: "The gap against you",
    description:
      "Add your domain to see estimated traffic side by side and the keywords they rank for that you don't show up for at all.",
  },
];

function CompetitorAnalysisPage() {
  return (
    <ToolFrame
      tool={TOOL}
      heading="Free SEO Competitor Analysis Tool"
      subhead="Look up any competitor's organic keywords and top pages, compare their search traffic to yours, and find keywords they rank for that you don't."
      highlights={HIGHLIGHTS}
      faqs={FAQS}
      cta={{
        heading: "Turn the gap into a plan",
        body: `Browse more competitor keywords in ${brand.name}, save the relevant ones, and add them to rank tracking. Start with free trial credits.`,
        featureLabel: "Learn about Domain Overview",
      }}
    >
      <CompetitorAnalysisTool />
      <p className="mt-4 text-sm leading-6 text-[var(--color-brand-muted)]">
        New to this? The{" "}
        <a
          href="/library/competitive-analysis/find-your-real-competitors"
          className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
        >
          competitive analysis library
        </a>{" "}
        covers how to pick the right competitors before you start pulling their
        keywords.
      </p>
    </ToolFrame>
  );
}
