import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/find-your-real-competitors.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { COMPETITIVE_ANALYSIS_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/competitive-analysis/find-your-real-competitors";

export const Route = createFileRoute(
  "/_marketing/library/competitive-analysis/find-your-real-competitors",
)({
  head: () =>
    buildPageSeo({
      title: "How to Find Your Real SEO Competitors",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Find out who your real competitors are"
      path={PATH}
      library={COMPETITIVE_ANALYSIS_LIBRARY}
    >
      <Content components={{ ...defaultMdxComponents }} />
    </LibrarySpokePage>
  ),
});
