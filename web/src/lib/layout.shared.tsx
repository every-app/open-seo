import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { brand } from "@/lib/brand";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <span className="font-semibold">{brand.name}</span>,
    },
    searchToggle: {
      enabled: false,
    },
    links: [
      {
        text: "Resources",
        url: "/blogs",
        items: [
          {
            text: "Blog",
            description: "SEO articles and guides.",
            url: "/blogs",
          },
          {
            text: "MCP",
            description: `Connect ${brand.name} to AI clients.`,
            url: "/docs/mcp",
          },
          {
            text: "Skills",
            description: `Focused ${brand.name} workflows.`,
            url: "/docs/skills",
          },
        ],
      },
      {
        text: "GitHub",
        url: brand.githubUrl,
        external: true,
      },
    ],
  };
}
