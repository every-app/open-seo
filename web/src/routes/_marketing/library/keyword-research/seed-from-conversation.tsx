import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/seed-from-conversation.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute(
  "/_marketing/library/keyword-research/seed-from-conversation",
)({
  head: () =>
    buildPageSeo({
      title:
        "Seed Keywords from Customer Conversations (Keyword Research Without a Paid Tool)",
      description: frontmatter.description,
      path: "/library/keyword-research/seed-from-conversation",
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Seed from conversation"
    >
      <Content components={{ ...defaultMdxComponents }} />
    </LibrarySpokePage>
  ),
});
