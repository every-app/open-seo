import { createFileRoute } from "@tanstack/react-router";
import { SerpSimulatorTool } from "@/components/serp-simulator-tool";
import { ToolFrame } from "@/lib/free-tools/tool-frame";
import { freeTools } from "@/lib/free-tools/tool-pages";
import { buildPageSeo } from "@/lib/seo";
import { brand } from "@/lib/brand";

const TOOL = freeTools["serp-simulator"];

export const Route = createFileRoute("/_marketing/serp-simulator")({
  head: () =>
    buildPageSeo({
      title:
        "Free SERP Simulator: Preview Your Google Title and Meta Description",
      description:
        "Preview your title and meta description in desktop and mobile search results, with pixel measurements and approximate truncation. No signup, no email.",
      path: TOOL.path,
      titleSuffix: brand.name,
      imageAlt: `${brand.name} free SERP snippet simulator`,
    }),
  component: SerpSimulatorPage,
});

const FAQS = [
  {
    question: "How long should a title tag be?",
    answer:
      "Keep the main topic near the start. This preview uses a 600-pixel desktop title and a two-line mobile title as guides. Letter widths vary, so character count alone does not tell you whether a title will fit.",
  },
  {
    question: "How long should a meta description be?",
    answer:
      "Put the most useful information first. This preview allows two lines on desktop and three on mobile, including the optional date. Actual snippets vary by query and screen size.",
  },
  {
    question: "Does this guarantee what Google will show?",
    answer:
      "No. Google rewrites titles and descriptions regularly, especially when they don't match the query. This is an approximation; Google may choose different text, fonts, or layout.",
  },
  {
    question: "Does this tool send my text anywhere?",
    answer:
      "No. Your title, description, and URL stay in your browser. The preview updates as you type.",
  },
];

const HIGHLIGHTS = [
  {
    title: "Measure title width",
    description:
      "See the width of your title in the preview font, alongside its character count.",
  },
  {
    title: "Desktop and mobile",
    description:
      "Switch between desktop and mobile previews to check how your text wraps.",
  },
  {
    title: "Nothing leaves the page",
    description:
      "Your title and description stay in your browser. No account is needed.",
  },
];

function SerpSimulatorPage() {
  return (
    <ToolFrame
      tool={TOOL}
      heading="Free SERP Simulator"
      subhead="Preview your Google title and meta description on desktop and mobile. Check the length and wording before you publish."
      highlights={HIGHLIGHTS}
      faqs={FAQS}
      cta={{
        heading: "Find every page that needs this",
        body: `Find missing, duplicate, and long titles and descriptions with an ${brand.name} site audit. Start with free trial credits.`,
        featureLabel: "Learn about Site Audit",
      }}
    >
      <SerpSimulatorTool />
    </ToolFrame>
  );
}
