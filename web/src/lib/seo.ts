import { FREE_TOOL_PATHS } from "@/lib/free-tools/free-tool-paths";

const DEFAULT_SITE_URL = "https://openseo.so";
const DEFAULT_SOCIAL_IMAGE_PATH = "/social-card.jpg";
const DEFAULT_SOCIAL_IMAGE_ALT = "OpenSEO product preview";

export const SITE_URL = (
  process.env.SITE_URL ??
  process.env.VITE_SITE_URL ??
  DEFAULT_SITE_URL
).replace(/\/+$/, "");

export function toCanonicalPath(path: string): string {
  if (!path || path === "/") return "/";

  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.replace(/\/+$/, "");
}

export function toCanonicalUrl(path: string): string {
  return new URL(toCanonicalPath(path), `${SITE_URL}/`).href;
}

// Pages whose share preview shows the page title on an OpenSEO card instead
// of the generic product card. An entry ending in "/" covers every page
// below it, but not the index page itself. scripts/generate-social-cards.js
// renders the cards from the built HTML.
const TITLE_CARD_PATHS = [
  "/blogs/",
  "/library/",
  "/openseo-vs-dataforseo",
  "/semrush-alternative",
  "/semrush-pricing",
  "/ahrefs-alternative",
  "/ahrefs-pricing",
  ...Object.values(FREE_TOOL_PATHS),
];

function hasTitleCard(canonicalPath: string): boolean {
  return TITLE_CARD_PATHS.some((entry) =>
    entry.endsWith("/")
      ? canonicalPath.startsWith(entry)
      : canonicalPath === entry,
  );
}

export function buildBreadcrumbJsonLd(
  items: Array<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: toCanonicalUrl(item.path),
    })),
  };
}

type BuildSeoParams = {
  title: string;
  path: string;
  description?: string;
  titleSuffix?: string;
  ogType?: "website" | "article";
  imageAlt?: string;
};

export function buildPageSeo({
  title,
  path,
  description,
  titleSuffix,
  ogType = "website",
  imageAlt,
}: BuildSeoParams) {
  const fullTitle = titleSuffix ? `${title} - ${titleSuffix}` : title;
  const canonicalPath = toCanonicalPath(path);
  const canonicalUrl = toCanonicalUrl(canonicalPath);
  const titleCard = hasTitleCard(canonicalPath);
  const socialImageUrl = toCanonicalUrl(
    titleCard ? `/og${canonicalPath}.png` : DEFAULT_SOCIAL_IMAGE_PATH,
  );
  // The card generator reads the card's title from this alt text.
  const socialImageAlt = titleCard
    ? title
    : (imageAlt ?? DEFAULT_SOCIAL_IMAGE_ALT);

  return {
    meta: [
      { title: fullTitle },
      ...(description ? [{ name: "description", content: description }] : []),
      { property: "og:site_name", content: "OpenSEO" },
      { property: "og:type", content: ogType },
      { property: "og:title", content: fullTitle },
      ...(description
        ? [{ property: "og:description", content: description }]
        : []),
      { property: "og:url", content: canonicalUrl },
      { property: "og:image", content: socialImageUrl },
      { property: "og:image:alt", content: socialImageAlt },
      {
        property: "og:image:type",
        content: titleCard ? "image/png" : "image/jpeg",
      },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: fullTitle },
      ...(description
        ? [{ name: "twitter:description", content: description }]
        : []),
      { name: "twitter:image", content: socialImageUrl },
      { name: "twitter:image:alt", content: socialImageAlt },
    ],
    links: [{ rel: "canonical", href: canonicalUrl }],
  };
}
