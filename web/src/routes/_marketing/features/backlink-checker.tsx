import { createFileRoute } from "@tanstack/react-router";
import { FeaturePageTemplate } from "@/components/feature-page";
import { featurePages } from "@/lib/feature-pages";
import { buildPageSeo } from "@/lib/seo";

const page = featurePages.backlinks;

export const Route = createFileRoute("/_marketing/features/backlink-checker")({
  head: () =>
    buildPageSeo({
      title:
        "Backlink Analysis Tool: Referring Domains, Anchors, Spam and Lost Links for Any Domain",
      description: page.seoDescription ?? page.description,
      path: "/features/backlink-checker",
      titleSuffix: "OpenSEO",
      imageAlt: page.imageAlt,
    }),
  component: () => <FeaturePageTemplate page={page} />,
});
