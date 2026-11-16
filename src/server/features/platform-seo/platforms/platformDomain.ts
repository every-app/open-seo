import { parse } from "tldts";
import { isValidDomainHost } from "@/shared/researchScope";
import { isGoogleRedirect } from "@/shared/google-serp-url";
import { safeHostname } from "@/shared/safe-url";

/**
 * Companies whose one domain holds many unrelated products: a Google Doc, a
 * Shopify community thread and Google Maps are different opportunities, so
 * results here are filed by subdomain, and on the bare domain by the first
 * path section (amazon.com/stores, google.com/maps). Matched by name so
 * country domains like google.co.uk count too.
 */
const UMBRELLA_NAMES = new Set([
  "adobe",
  "amazon",
  "apple",
  "bing",
  "google",
  "icloud",
  "live",
  "microsoft",
  "shopify",
  "visualstudio",
  "yahoo",
]);
// Shared suffixes tldts doesn't split, so every *.us.com isn't one site.
const UMBRELLA_DOMAINS = new Set(["us.com"]);
// Two-letter sections that aren't locales (amazon.com/dp, amazon.com/gp).
const SHORT_SECTIONS = new Set(["dp", "gp"]);

// A path section that names a product area, not a locale, slug or id.
function sectionOf(url: string | null | undefined) {
  if (!url || isGoogleRedirect(url)) return null;
  let segments: string[];
  try {
    segments = new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return null;
  }
  for (const raw of segments.slice(0, 3)) {
    // Sections are lowercase; Title-Case is a product or page name.
    if (/[A-Z]/.test(raw)) continue;
    const segment = raw.toLowerCase();
    if (SHORT_SECTIONS.has(segment)) return segment;
    if (segment === "intl") continue; // google.com/intl/en/...
    if (/^[a-z]{2}(?:[-_][a-z]{2})?$/.test(segment)) continue; // en, en-us
    if (!/^[a-z][a-z0-9._~-]{0,23}$/.test(segment)) continue;
    if ((segment.match(/-/g) ?? []).length > 2) continue; // product slugs
    if (segment.length >= 6 && /\d/.test(segment)) continue; // ids
    return segment;
  }
  return null;
}

/**
 * The platform a search result belongs to: its registrable domain, so every
 * user.medium.com or foo.blogspot.com collapses into the platform itself.
 * On a big company's domain it's the subdomain or product section instead
 * (sites.google.com, docs.google.com, amazon.com/stores).
 * Returns null when the result can't be pinned to a real site, such as a
 * google.com/goto row whose breadcrumb isn't a URL.
 */
export function platformDomain(item: {
  domain?: string | null;
  url?: string | null;
}): string | null {
  const host =
    item.domain
      ?.trim()
      .toLowerCase()
      .replace(/^www\./, "") ||
    (item.url && !isGoogleRedirect(item.url) ? safeHostname(item.url) : null);
  if (!host || !isValidDomainHost(host)) return null;
  const parsed = parse(host);
  const domain = parsed.domain ?? host;
  if (!isUmbrella(domain, parsed.domainWithoutSuffix)) return domain;
  if (host !== domain) return host;
  const section = sectionOf(item.url);
  return section ? `${host}/${section}` : host;
}

function isUmbrella(domain: string, name: string | null | undefined) {
  return UMBRELLA_DOMAINS.has(domain) || UMBRELLA_NAMES.has(name ?? "");
}

/**
 * Whether a platform key is a big company's whole domain (amazon.com), which
 * search results never file under: they use a section like amazon.com/dp.
 */
export function isBareUmbrella(key: string) {
  if (key.includes("/")) return false;
  const parsed = parse(key);
  return parsed.domain === key && isUmbrella(key, parsed.domainWithoutSuffix);
}

/**
 * Platforms already known to let anyone make a profile or publish, added as
 * parasite platforms the first time they turn up, so they never wait for
 * review.
 */
export const KNOWN_PARASITE_PLATFORMS = new Set([
  "about.me",
  "behance.net",
  "blogger.com",
  "blogspot.com",
  "carrd.co",
  "dev.to",
  "dribbble.com",
  "facebook.com",
  "ghost.io",
  "github.com",
  "github.io",
  "gitbook.io",
  "hackernoon.com",
  "hashnode.com",
  "hashnode.dev",
  "hubpages.com",
  "indiehackers.com",
  "instagram.com",
  "issuu.com",
  "linkedin.com",
  "linktr.ee",
  "medium.com",
  "mystrikingly.com",
  "netlify.app",
  "notion.site",
  "pages.dev",
  "patreon.com",
  "pinterest.com",
  "producthunt.com",
  "quora.com",
  "reddit.com",
  "scribd.com",
  "sites.google.com",
  "slideshare.net",
  "substack.com",
  "telegra.ph",
  "tiktok.com",
  "tumblr.com",
  "twitter.com",
  "vercel.app",
  "vocal.media",
  "webflow.io",
  "weebly.com",
  "wixsite.com",
  "wordpress.com",
  "x.com",
  "youtube.com",
]);
