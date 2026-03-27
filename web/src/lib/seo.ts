const DEFAULT_SITE_URL = "https://openseo.so";
const DEFAULT_SOCIAL_IMAGE_PATH = "/social-card.png";
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

type BuildSeoParams = {
  title: string;
  path: string;
  description?: string;
  titleSuffix?: string;
  ogType?: "website" | "article";
  imagePath?: string;
  imageAlt?: string;
};

export function buildPageSeo({
  title,
  path,
  description,
  titleSuffix,
  ogType = "website",
  imagePath = DEFAULT_SOCIAL_IMAGE_PATH,
  imageAlt = DEFAULT_SOCIAL_IMAGE_ALT,
}: BuildSeoParams) {
  const fullTitle = titleSuffix ? `${title} - ${titleSuffix}` : title;
  const canonicalUrl = toCanonicalUrl(path);
  const socialImageUrl = toCanonicalUrl(imagePath);

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
      { property: "og:image:alt", content: imageAlt },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: fullTitle },
      ...(description ? [{ name: "twitter:description", content: description }] : []),
      { name: "twitter:image", content: socialImageUrl },
      { name: "twitter:image:alt", content: imageAlt },
    ],
    links: [{ rel: "canonical", href: canonicalUrl }],
  };
}
