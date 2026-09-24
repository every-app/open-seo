import { createFileRoute } from "@tanstack/react-router";
import { KeywordDiscoveryTool } from "@/components/keyword-discovery-tool";
import { ToolFrame } from "@/lib/free-tools/tool-frame";
import { freeTools } from "@/lib/free-tools/tool-pages";
import { buildPageSeo } from "@/lib/seo";
import { brand } from "@/lib/brand";
const TOOL = freeTools["keyword-generator"];
export const Route = createFileRoute("/_marketing/keyword-generator")({
  head: () =>
    buildPageSeo({
      title: "Free Keyword Generator",
      description:
        "Start with a topic and find keyword ideas people search for. Compare estimated search volume and difficulty in your target country.",
      path: TOOL.path,
      titleSuffix: brand.name,
      imageAlt: "Free Keyword Generator",
    }),
  component: Page,
});
const HIGHLIGHTS = [
  {
    title: "Ideas from a topic",
    description:
      "Get up to 20 keyword suggestions from a short phrase, such as email marketing or running shoes.",
  },
  {
    title: "Monthly search volume",
    description:
      "See estimated Google searches in your selected country. Use volume to compare demand, not to predict visits.",
  },
  {
    title: "Difficulty estimates",
    description:
      "Use the available 0–100 difficulty scores as an initial check, then review the search results before choosing a keyword.",
  },
];
const FAQS = [
  {
    question: "Does this use AI to invent keywords?",
    answer:
      "No. Suggestions come from DataForSEO’s Google keyword database, with available volume and difficulty metrics. Some topics or countries may return few or no ideas.",
  },
  {
    question: "How should I choose a starting topic?",
    answer:
      "Use a short phrase that describes your product, service, or audience’s problem. If the results are too broad, try a more specific phrase; if there are no results, try a broader one.",
  },
  {
    question: "What do missing metrics mean?",
    answer:
      "A dash means the provider has no value for that metric. It does not mean zero searches or zero competition. Volumes are estimates, and close variations can share the same estimate.",
  },
  {
    question: "How current are the results?",
    answer:
      "The tool uses DataForSEO’s keyword database, which is updated periodically. Results may be cached for up to 24 hours; they are not a real-time count of searches.",
  },
  {
    question: "Is this free?",
    answer:
      `Yes. You can get up to 20 keyword ideas without signup. Usage limits apply. The full ${brand.name} workspace uses paid credits. Free trial credits are available to get started.`,
  },
];
function Page() {
  return (
    <ToolFrame
      tool={TOOL}
      heading={"Free Keyword Generator"}
      subhead={
        "Start with a topic and find keyword ideas people search for. Compare estimated search volume and difficulty in your target country."
      }
      highlights={HIGHLIGHTS}
      faqs={FAQS}
      cta={{
        heading: "Choose your next content topic",
        body: `Continue your research in ${brand.name} and save keywords to your project. Start with free trial credits.`,
        featureLabel: "Explore keyword research",
      }}
    >
      <KeywordDiscoveryTool tool={"keyword-generator"} />
      <p className="mt-4 text-sm leading-6 text-[var(--color-brand-muted)]">
        Already know a competitor in your space?{" "}
        <a
          className="font-medium text-neutral-950 underline underline-offset-4"
          href="/competitor-keyword-finder"
        >
          Find their ranking keywords &rarr;
        </a>
      </p>
    </ToolFrame>
  );
}
