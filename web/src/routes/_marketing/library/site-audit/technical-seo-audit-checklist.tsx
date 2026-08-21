import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/technical-seo-audit-checklist.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { SITE_AUDIT_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/site-audit/technical-seo-audit-checklist";

export const Route = createFileRoute(
  "/_marketing/library/site-audit/technical-seo-audit-checklist",
)({
  head: () =>
    buildPageSeo({
      title: "The Technical SEO Audit Checklist That Ends in Fixes",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="The technical SEO audit checklist"
      path={PATH}
      library={SITE_AUDIT_LIBRARY}
    >
      <Content components={{ ...defaultMdxComponents }} />
    </LibrarySpokePage>
  ),
});
