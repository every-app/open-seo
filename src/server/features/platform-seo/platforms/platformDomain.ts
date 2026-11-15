import { getDomain } from "tldts";
import { isValidDomainHost } from "@/shared/researchScope";
import { isGoogleRedirect } from "@/shared/google-serp-url";
import { safeHostname } from "@/shared/safe-url";

// Hosts that share a registrable domain with something unrelated, kept whole
// so Google Sites isn't filed under google.com.
const KEEP_WHOLE_HOSTS = ["sites.google.com"];

/**
 * The platform a search result belongs to: its registrable domain, so every
 * user.medium.com or foo.blogspot.com collapses into the platform itself.
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
  const whole = KEEP_WHOLE_HOSTS.find(
    (keep) => host === keep || host.endsWith(`.${keep}`),
  );
  if (whole) return whole;
  return getDomain(host) ?? host;
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
