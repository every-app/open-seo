import { createFileRoute } from "@tanstack/react-router";
import { BacklinkCheckerTool } from "@/components/backlink-checker-tool";
import { ToolFrame } from "@/lib/free-tools/tool-frame";
import { freeTools } from "@/lib/free-tools/tool-pages";
import { buildPageSeo } from "@/lib/seo";
import { brand } from "@/lib/brand";

const TOOL = freeTools["backlink-checker"];

export const Route = createFileRoute("/_marketing/backlink-checker")({
  // `?target=example.com` prefills the input. Plain links still work.
  validateSearch: (search: Record<string, unknown>): { target?: string } =>
    typeof search.target === "string" ? { target: search.target } : {},
  head: () =>
    buildPageSeo({
      title: "Free Backlink Checker: Check Backlinks to Any Website",
      description:
        "Check backlinks for any domain: referring domains, top backlinks, anchor text, and follow status. Instant results, no signup, no email.",
      path: TOOL.path,
      titleSuffix: brand.name,
      imageAlt: `${brand.name} free backlink checker`,
    }),
  component: BacklinkCheckerPage,
});

const FAQS = [
  {
    question: "Where does the backlink data come from?",
    answer:
      `Results come from DataForSEO's link index, the same data source that powers backlink research inside ${brand.name}. The index is refreshed continuously, so counts can differ slightly from other tools that crawl the web on their own schedule.`,
  },
  {
    question: "How many backlinks can I see for free?",
    answer:
      `The free checker shows a domain's summary metrics and its top 15 backlinks, one per referring domain, ranked by domain strength. Sign up for ${brand.name} to page through the full list, see referring domains and anchors, filter out spam, and export the data.`,
  },
  {
    question: "Can I check a competitor's backlinks?",
    answer:
      "Yes. Enter your domain, a competitor's, or a site you're evaluating for outreach. Backlink data is public-web data, so no site ownership or verification is needed.",
  },
  {
    question: "What is domain rank?",
    answer:
      "Domain rank is a 0-100 score of a domain's link-profile strength, similar to domain authority metrics in other tools. Higher means the domain has more and stronger links pointing at it.",
  },
];

const HIGHLIGHTS = [
  {
    title: "Link profile summary",
    description:
      "Domain rank, total backlinks, referring domains, and broken backlinks for the domain you check.",
  },
  {
    title: "Top backlinks",
    description:
      "The strongest links pointing at the domain, one per referring domain, with anchor text and follow status.",
  },
  {
    title: "Competitor visibility",
    description:
      "Works on any domain, so you can see who links to competitors and where their authority comes from.",
  },
];

function BacklinkCheckerPage() {
  const { target } = Route.useSearch();

  return (
    <ToolFrame
      tool={TOOL}
      heading="Free Backlink Checker"
      subhead="Check the backlinks of any website. Enter a domain and get its domain rank, referring domains, and top backlinks with anchor text and follow status."
      highlights={HIGHLIGHTS}
      faqs={FAQS}
      cta={{
        heading: "Explore more backlinks",
        body: `Browse referring domains, review anchor text, and filter backlinks in ${brand.name}. Start with free trial credits.`,
        featureLabel: "Learn about the Backlinks feature",
      }}
    >
      <BacklinkCheckerTool initialTarget={target} />
    </ToolFrame>
  );
}
