import { createFileRoute } from "@tanstack/react-router";
import { WebsiteTrafficCheckerTool } from "@/components/website-traffic-checker-tool";
import { ToolFrame } from "@/lib/free-tools/tool-frame";
import { freeTools } from "@/lib/free-tools/tool-pages";
import { buildPageSeo } from "@/lib/seo";
import { brand } from "@/lib/brand";

const TOOL = freeTools["website-traffic-checker"];

export const Route = createFileRoute("/_marketing/website-traffic-checker")({
  head: () =>
    buildPageSeo({
      title:
        "Free Website Traffic Checker: Estimate Any Site's Organic Traffic",
      description:
        "Estimate any website's organic traffic, keyword count, and traffic value, with its top keywords and pages. Compare two domains. No signup, no email.",
      path: TOOL.path,
      titleSuffix: brand.name,
      imageAlt: `${brand.name} free website traffic checker`,
    }),
  component: WebsiteTrafficCheckerPage,
});

const FAQS = [
  {
    question: "How accurate are these traffic numbers?",
    answer:
      "DataForSEO estimates organic traffic from rankings and search volume. Use these estimates to compare domains; they do not measure actual visits.",
  },
  {
    question: "Why does this differ from Google Analytics?",
    answer:
      "Analytics counts the visits that actually happened, across every channel. This estimates organic search visits only, for one country, from ranking data. Differences are expected.",
  },
  {
    question: "How much do I get for free?",
    answer:
      `The summary metrics plus the top 5 keywords and top 5 pages per domain, for one country at a time. ${brand.name} lets you browse more keywords and pages, filter the results, and save keywords for rank tracking.`,
  },
  {
    question: "Where does the data come from?",
    answer:
      `DataForSEO's Labs index — the same source behind ${brand.name}'s domain overview. Results are cached for 24 hours per domain and country.`,
  },
];

const HIGHLIGHTS = [
  {
    title: "Organic traffic estimate",
    description:
      "Estimated monthly organic visits, how many keywords the domain ranks for, and what that traffic would cost to buy.",
  },
  {
    title: "Top keywords and pages",
    description:
      "The five keywords driving the most traffic and the five pages earning it, with volume, position, and ranking URL.",
  },
  {
    title: "Compare two domains",
    description:
      "Add a second domain to compare traffic and keyword counts, then explore the top keywords and pages for each site.",
  },
];

function WebsiteTrafficCheckerPage() {
  return (
    <ToolFrame
      tool={TOOL}
      heading="Free Website Traffic Checker"
      subhead="Estimate how much organic search traffic any website gets, which keywords bring it, and which pages earn it. Add a second domain to compare."
      highlights={HIGHLIGHTS}
      faqs={FAQS}
      cta={{
        heading: "Explore more keywords and pages",
        body: `Explore domain reports, save promising keywords, and track their rankings in ${brand.name}. Start with free trial credits.`,
        featureLabel: "Learn about Domain Overview",
      }}
    >
      <WebsiteTrafficCheckerTool />
    </ToolFrame>
  );
}
