const DEFAULT_SITE_URL = "https://openrank.io";

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
};

export function buildPageSeo({
  title,
  path,
  description,
  titleSuffix,
  ogType = "website",
}: BuildSeoParams) {
  const fullTitle = titleSuffix ? `${title} - ${titleSuffix}` : title;
  const canonicalUrl = toCanonicalUrl(path);

  return {
    meta: [
      { title: fullTitle },
      ...(description ? [{ name: "description", content: description }] : []),
      { property: "og:type", content: ogType },
      { property: "og:title", content: fullTitle },
      ...(description
        ? [{ property: "og:description", content: description }]
        : []),
      { property: "og:url", content: canonicalUrl },
    ],
    links: [{ rel: "canonical", href: canonicalUrl }],
  };
}
