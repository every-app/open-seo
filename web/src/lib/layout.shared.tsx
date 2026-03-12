import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <span className="font-semibold">OpenRank</span>,
    },
    links: [
      {
        text: "GitHub",
        url: "https://github.com/every-app/open-seo",
        external: true,
      },
    ],
  };
}
