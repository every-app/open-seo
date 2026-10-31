import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import PartnerTermsContent, {
  frontmatter as partnerTermsFrontmatter,
} from "../../../content/legal/partner-terms.md";
import { LegalPage } from "@/components/legal-page";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/_marketing/partner-terms")({
  head: () =>
    buildPageSeo({
      title: partnerTermsFrontmatter.title,
      description: partnerTermsFrontmatter.description,
      path: "/partner-terms",
      titleSuffix: "OpenSEO",
    }),
  component: PartnerTerms,
});

function PartnerTerms() {
  return (
    <LegalPage
      title={partnerTermsFrontmatter.title}
      description={partnerTermsFrontmatter.description}
    >
      <PartnerTermsContent components={defaultMdxComponents} />
    </LegalPage>
  );
}
