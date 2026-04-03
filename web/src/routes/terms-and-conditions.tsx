import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import TermsAndConditionsContent, {
  frontmatter as termsFrontmatter,
} from "../../content/legal/terms-and-conditions.md";
import { LegalPage } from "@/components/legal-page";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/terms-and-conditions")({
  head: () =>
    buildPageSeo({
      title: termsFrontmatter.title,
      description: termsFrontmatter.description,
      path: "/terms-and-conditions",
      titleSuffix: "OpenSEO",
    }),
  component: TermsAndConditions,
});

function TermsAndConditions() {
  return (
    <LegalPage
      title={termsFrontmatter.title}
      description={termsFrontmatter.description}
    >
      <TermsAndConditionsContent components={defaultMdxComponents} />
    </LegalPage>
  );
}
