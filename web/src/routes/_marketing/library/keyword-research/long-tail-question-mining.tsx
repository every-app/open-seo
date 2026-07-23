import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/long-tail-question-mining.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute(
  "/_marketing/library/keyword-research/long-tail-question-mining",
)({
  head: () =>
    buildPageSeo({
      title: "What Are Long-Tail Keywords? How to Find and Use Them",
      description: frontmatter.description,
      path: "/library/keyword-research/long-tail-question-mining",
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Long-tail & question mining"
    >
      <Content components={{ ...defaultMdxComponents }} />
    </LibrarySpokePage>
  ),
});
