import { createFileRoute } from "@tanstack/react-router";
import { SpamScoreCheckerTool } from "@/components/spam-score-checker-tool";
import { ToolFrame } from "@/lib/free-tools/tool-frame";
import { freeTools } from "@/lib/free-tools/tool-pages";
import { buildPageSeo } from "@/lib/seo";
import { brand } from "@/lib/brand";

const TOOL = freeTools["spam-score-checker"];

export const Route = createFileRoute("/_marketing/spam-score-checker")({
  head: () =>
    buildPageSeo({
      title: "Free Backlink Spam Score Checker",
      description:
        "Check a domain's backlink spam score and see the spammiest links pointing at it. No signup, no email.",
      path: TOOL.path,
      titleSuffix: brand.name,
      imageAlt: `${brand.name} free backlink spam score checker`,
    }),
  component: SpamScoreCheckerPage,
});

const FAQS = [
  {
    question: "What does the spam score actually measure?",
    answer:
      "DataForSEO scores a link profile from 0 to 100 by looking at signals its index associates with low-quality sites — thin or duplicated content, link networks, unusual outbound link patterns. Higher means more of those signals. It is not a Google penalty score; Google publishes no such number.",
  },
  {
    question: "Should I disavow the links you show?",
    answer:
      "Usually not. Google ignores most low-quality links on its own, and disavowing good links does real damage. Treat a high score as a reason to look, not as a to-do list.",
  },
  {
    question: "How many links does the free check show?",
    answer:
      `The 10 highest-spam referring domains, one link each. ${brand.name} lets you filter the full backlink profile by spam score and see how much of the profile is affected.`,
  },
  {
    question: "Where does the data come from?",
    answer:
      `DataForSEO's backlink index, cached for 24 hours per domain. It's the same data ${brand.name} uses for backlink research.`,
  },
];

const HIGHLIGHTS = [
  {
    title: "Two spam scores",
    description:
      "One for the links pointing at the domain, one for the domain itself. They answer different questions and often disagree.",
  },
  {
    title: "The worst offenders",
    description:
      "The 10 spammiest referring domains, with the linking page, anchor text, and whether the link is follow or nofollow.",
  },
  {
    title: "Put the score in context",
    description:
      "See spam scores alongside referring domains and domain rank. Use a high score as a reason to review the links, not as proof of a penalty.",
  },
];

function SpamScoreCheckerPage() {
  return (
    <ToolFrame
      tool={TOOL}
      heading="Free Backlink Spam Score Checker"
      subhead="Check how spammy a domain's backlink profile looks, and see which referring domains are dragging the score up."
      highlights={HIGHLIGHTS}
      faqs={FAQS}
      cta={{
        heading: "Review more of the backlink profile",
        body: `Filter backlinks by spam score, rank, and follow status in ${brand.name}. Start with free trial credits.`,
        featureLabel: "Learn about Backlinks",
      }}
    >
      <SpamScoreCheckerTool />
    </ToolFrame>
  );
}
