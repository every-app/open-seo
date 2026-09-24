import { createFileRoute } from "@tanstack/react-router";
import { KeywordDiscoveryTool } from "@/components/keyword-discovery-tool";
import { ToolFrame } from "@/lib/free-tools/tool-frame";
import { freeTools } from "@/lib/free-tools/tool-pages";
import { buildPageSeo } from "@/lib/seo";
import { brand } from "@/lib/brand";
const TOOL = freeTools["competitor-keyword-finder"];
export const Route = createFileRoute("/_marketing/competitor-keyword-finder")({
  head: () =>
    buildPageSeo({
      title: "Free Competitor Keyword Finder",
      description:
        "Find the keywords a competitor ranks for on Google, with search volumes, ranking positions, and the pages that rank. Enter a domain to get started.",
      path: TOOL.path,
      titleSuffix: brand.name,
      imageAlt: "Free Competitor Keyword Finder",
    }),
  component: Page,
});
const HIGHLIGHTS = [
  {
    title: "Their top keywords",
    description:
      "See up to 20 organic keywords, starting with those estimated to bring the most Google traffic.",
  },
  {
    title: "Search demand and difficulty",
    description:
      "Compare estimated monthly search volume and difficulty where available before choosing what to target.",
  },
  {
    title: "The pages that rank",
    description:
      "Open the ranking URL for each keyword to see the content you would compete with.",
  },
];
const FAQS = [
  {
    question: "Can I check my own website?",
    answer:
      "Yes. Enter your domain or a competitor’s domain. You don’t need to know any of its keywords beforehand.",
  },
  {
    question: "How is this different from a rank checker?",
    answer:
      "A rank checker checks the position of a keyword you already know. This tool discovers keywords a domain ranks for, so you can find ideas you haven’t considered.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "Results come from DataForSEO’s Google keyword database for the selected country. They are a sample of known rankings, not a live Google search or a complete list. Results may be cached for 24 hours.",
  },
  {
    question: "Can I see their top pages or compare two sites?",
    answer:
      "Use our Competitor Analysis tool for top pages and an optional keyword comparison with your own domain.",
  },
  {
    question: "Is this free?",
    answer:
      `Yes. This tool returns up to 20 keywords without signup. Usage limits apply. The full ${brand.name} workspace uses paid credits; free trial credits are available to get started.`,
  },
];
function Page() {
  return (
    <ToolFrame
      tool={TOOL}
      heading={"Free Competitor Keyword Finder"}
      subhead={
        "Find the keywords a competitor ranks for on Google, with search volumes, ranking positions, and the pages that rank. Enter a domain to get started."
      }
      highlights={HIGHLIGHTS}
      faqs={FAQS}
      cta={{
        heading: "Choose your next content topic",
        body: `Continue your research in ${brand.name} and save keywords to your project. Start with free trial credits.`,
        featureLabel: "Explore Domain Overview",
      }}
    >
      <KeywordDiscoveryTool tool={"competitor-keyword-finder"} />
      <p className="mt-4 text-sm leading-6 text-[var(--color-brand-muted)]">
        Want their top pages and a comparison with your site?{" "}
        <a
          className="font-medium text-neutral-950 underline underline-offset-4"
          href="/competitor-analysis"
        >
          Try Competitor Analysis &rarr;
        </a>
      </p>
    </ToolFrame>
  );
}
