import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import PrivacyContent, {
  frontmatter as privacyFrontmatter,
} from "../../../content/legal/privacy.md";
import { LegalPage } from "@/components/legal-page";
import { buildPageSeo } from "@/lib/seo";
import { brand } from "@/lib/brand";

export const Route = createFileRoute("/_marketing/privacy")({
  head: () =>
    buildPageSeo({
      title: privacyFrontmatter.title,
      description: privacyFrontmatter.description,
      path: "/privacy",
      titleSuffix: brand.name,
    }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage
      title={privacyFrontmatter.title}
      description={privacyFrontmatter.description}
    >
      <PrivacyContent components={defaultMdxComponents} />
    </LegalPage>
  );
}
