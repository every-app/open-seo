import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/search-intent-mapping.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute(
  "/_marketing/library/keyword-research/search-intent-mapping",
)({
  head: () =>
    buildPageSeo({
      title: "What Is Search Intent? Mapping Keywords Hot, Warm, and Cold",
      description: frontmatter.description,
      path: "/library/keyword-research/search-intent-mapping",
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Search-intent mapping"
    >
      <Content components={{ ...defaultMdxComponents }} />
    </LibrarySpokePage>
  ),
});
