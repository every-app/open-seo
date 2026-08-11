import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/opportunity-sizing-forecasting.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute(
  "/_marketing/library/keyword-research/opportunity-sizing-forecasting",
)({
  head: () =>
    buildPageSeo({
      title: "SEO Forecasting: Size a Keyword Opportunity Before You Build",
      description: frontmatter.description,
      path: "/library/keyword-research/opportunity-sizing-forecasting",
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Opportunity sizing & forecasting"
    >
      <Content components={{ ...defaultMdxComponents }} />
    </LibrarySpokePage>
  ),
});
