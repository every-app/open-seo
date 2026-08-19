import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/competitor-traffic-estimates.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { COMPETITIVE_ANALYSIS_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/competitive-analysis/competitor-traffic-estimates";

export const Route = createFileRoute(
  "/_marketing/library/competitive-analysis/competitor-traffic-estimates",
)({
  head: () =>
    buildPageSeo({
      title: "How Accurate Are Competitor Traffic Estimates?",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="How accurate are competitor traffic estimates?"
      path={PATH}
      library={COMPETITIVE_ANALYSIS_LIBRARY}
    >
      <Content components={{ ...defaultMdxComponents }} />
    </LibrarySpokePage>
  ),
});
