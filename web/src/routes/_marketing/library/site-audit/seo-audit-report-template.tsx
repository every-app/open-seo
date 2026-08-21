import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/seo-audit-report-template.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { SITE_AUDIT_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/site-audit/seo-audit-report-template";

export const Route = createFileRoute(
  "/_marketing/library/site-audit/seo-audit-report-template",
)({
  head: () =>
    buildPageSeo({
      title: "SEO Audit Report Template: Structure That Gets Actioned",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Write an audit report the client will act on"
      path={PATH}
      library={SITE_AUDIT_LIBRARY}
    >
      <Content components={{ ...defaultMdxComponents }} />
    </LibrarySpokePage>
  ),
});
