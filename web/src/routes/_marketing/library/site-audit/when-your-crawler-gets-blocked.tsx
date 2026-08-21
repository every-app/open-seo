import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/when-your-crawler-gets-blocked.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { SITE_AUDIT_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/site-audit/when-your-crawler-gets-blocked";

export const Route = createFileRoute(
  "/_marketing/library/site-audit/when-your-crawler-gets-blocked",
)({
  head: () =>
    buildPageSeo({
      title: "When Your Own SEO Crawler Gets Blocked",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="When your own crawler gets blocked"
      path={PATH}
      library={SITE_AUDIT_LIBRARY}
    >
      <Content components={{ ...defaultMdxComponents }} />
    </LibrarySpokePage>
  ),
});
