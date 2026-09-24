import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/backlink-gap-analysis.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { COMPETITIVE_ANALYSIS_LIBRARY } from "@/lib/strategy-libraries";
import { brand } from "@/lib/brand";

const PATH = "/library/competitive-analysis/backlink-gap-analysis";

export const Route = createFileRoute(
  "/_marketing/library/competitive-analysis/backlink-gap-analysis",
)({
  head: () =>
    buildPageSeo({
      title: "Competitor Backlink Analysis: Read the Profile First",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: `${brand.name} Library`,
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb={"Read a competitor's link profile before you copy it"}
      path={PATH}
      library={COMPETITIVE_ANALYSIS_LIBRARY}
    >
      <Content components={{ ...defaultMdxComponents }} />
    </LibrarySpokePage>
  ),
});
