import { createFileRoute } from "@tanstack/react-router";
import { DomainAgeCheckerTool } from "@/components/domain-age-checker-tool";
import { ToolFrame } from "@/lib/free-tools/tool-frame";
import { freeTools } from "@/lib/free-tools/tool-pages";
import { buildPageSeo } from "@/lib/seo";
import { brand } from "@/lib/brand";

const TOOL = freeTools["domain-age-checker"];

export const Route = createFileRoute("/_marketing/domain-age-checker")({
  head: () =>
    buildPageSeo({
      title: "Free Domain Age Checker: Registration Date and Age",
      description:
        "Check when a domain was registered, how old it is, when it expires, and who the registrar is — up to 10 domains at once. No signup, no email.",
      path: TOOL.path,
      titleSuffix: brand.name,
      imageAlt: `${brand.name} free domain age checker`,
    }),
  component: DomainAgeCheckerPage,
});

const FAQS = [
  {
    question: "Does domain age affect rankings?",
    answer:
      "Barely, on its own. Google has said age isn't a ranking factor. What correlates with age is everything a site accumulates over years — links, content, brand searches — and those do matter. Old and empty ranks worse than new and useful.",
  },
  {
    question: "Where does this data come from?",
    answer:
      "RDAP, the registry protocol that replaced WHOIS. The lookup goes straight to the registry that holds the domain, so there's no third-party data source and nothing to pay for.",
  },
  {
    question: "Why does a domain show no registration data?",
    answer:
      "Some country-code TLDs don't publish RDAP records, and some registries hide dates. The tool says so for that row rather than guessing, and the other domains in your list still return.",
  },
  {
    question: "Is the age the same as when the site launched?",
    answer:
      "No. It's when the domain was first registered. A domain can sit parked for years, or change hands and start over with new content. Check what it ranks for before drawing conclusions.",
  },
];

const HIGHLIGHTS = [
  {
    title: "Age in years and months",
    description:
      "Registration date, age in years and months, last update, and expiry for every domain you paste in.",
  },
  {
    title: "Registrar on record",
    description:
      "Who the domain is registered through, when the registry publishes it.",
  },
  {
    title: "Ten at a time",
    description:
      "Useful when you're sizing up a list of link prospects or expired domains and want the dates in one table.",
  },
];

function DomainAgeCheckerPage() {
  return (
    <ToolFrame
      tool={TOOL}
      heading="Free Domain Age Checker"
      subhead="See when a domain was registered, how old it is, when it expires, and which registrar it uses. Up to 10 domains at once, straight from the registry."
      highlights={HIGHLIGHTS}
      faqs={FAQS}
      cta={{
        heading: "Check the domain's rankings and links",
        body: `Look up the domain's ranking keywords and backlinks in ${brand.name}. Start with free trial credits.`,
        featureLabel: "Learn about Domain Overview",
      }}
    >
      <DomainAgeCheckerTool />
    </ToolFrame>
  );
}
