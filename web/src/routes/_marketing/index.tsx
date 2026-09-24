import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing-page";
import { brand } from "@/lib/brand";
import { buildPageSeo } from "@/lib/seo";

const homeTitle = `${brand.name} - ${brand.tagline}`;
const homeDescription =
  `${brand.name} is the modern alternative to Ahrefs and Semrush. Keyword research, backlinks, rank tracking, and site audits, billed by usage instead of a $100-plus monthly subscription. Connect it to your AI agents over MCP.`;

export const Route = createFileRoute("/_marketing/")({
  head: () => {
    const seo = buildPageSeo({
      title: homeTitle,
      description: homeDescription,
      path: "/",
      imageAlt: `${brand.name} keyword research dashboard preview`,
    });

    return {
      ...seo,
      links: [
        ...(seo.links ?? []),
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap",
        },
      ],
    };
  },
  component: LandingPage,
});
