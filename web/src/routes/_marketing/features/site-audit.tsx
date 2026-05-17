import { createFileRoute } from "@tanstack/react-router";
import { FeaturePageTemplate } from "@/components/feature-page";
import { featurePages } from "@/lib/feature-pages";
import { buildPageSeo } from "@/lib/seo";

const page = featurePages.siteAudit;

export const Route = createFileRoute("/_marketing/features/site-audit")({
  head: () =>
    buildPageSeo({
      title: "SEO Audit Tool",
      description: page.description,
      path: "/features/site-audit",
      titleSuffix: "OpenSEO",
      imageAlt: page.imageAlt,
    }),
  component: () => <FeaturePageTemplate page={page} />,
});
