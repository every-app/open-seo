import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/index-bloat.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { SITE_AUDIT_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/site-audit/index-bloat";

export const Route = createFileRoute(
  "/_marketing/library/site-audit/index-bloat",
)({
  head: () =>
    buildPageSeo({
      title: "Index Bloat: When the Fix Is Deleting Pages",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Index bloat"
      path={PATH}
      library={SITE_AUDIT_LIBRARY}
    >
      <Content components={{ ...defaultMdxComponents }} />
    </LibrarySpokePage>
  ),
});
