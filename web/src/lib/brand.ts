// Single source of truth for everything on the marketing/docs site that names
// or links to the product.
//
// This mirrors `src/shared/brand.ts` in the application. The website is a
// separate build and cannot import from `../src`, so the values are repeated
// here and must be kept in sync by hand. Internal identifiers (MCP server key,
// plugin name, skill slugs, wrangler resource names) are deliberately not
// branded; renaming them would break installed agents.
//
// Anything ending in `Url` must be an absolute https URL with no trailing
// slash. The `.example` hosts below are RFC 2606 placeholders; replace them
// before the first deploy.

import { SITE_ORIGIN } from "@/lib/site-origin.js";

export const brand = {
  // Product name as shown in the nav, footer, page titles and OG tags.
  name: "SEOShark",
  // Short descriptor used in metadata.
  tagline: "All-in-one SEO tool for you and your AI agent",
  // This site. Also the default canonical/sitemap base when SITE_URL is unset.
  marketingUrl: SITE_ORIGIN,
  // Hosted app origin: sign-in/sign-up CTAs, the MCP endpoint, agent setup.
  appUrl: "https://app.seoshark.example",
  docsUrl: `${SITE_ORIGIN}/docs`,
  pricingUrl: `${SITE_ORIGIN}/pricing`,
  termsUrl: `${SITE_ORIGIN}/terms-and-conditions`,
  privacyUrl: `${SITE_ORIGIN}/privacy`,
  // Human support channel shown on the support page and in legal text.
  supportEmail: "support@seoshark.example",
  // Optional community links. Leave undefined to hide the corresponding UI.
  discordUrl: undefined as string | undefined,
  githubUrl: "https://github.com/bizztor/seoshark",
  // Square icon (>= 512px) referenced by the manifest and MCP clients.
  iconUrl: `${SITE_ORIGIN}/android-chrome-512x512.png`,
  // Social preview image for shared pages.
  socialCardUrl: `${SITE_ORIGIN}/social-card.jpg`,
} as const;

// Common app deep links, so routes never assemble them by hand.
export const appLinks = {
  signIn: `${brand.appUrl}/sign-in`,
  signUp: `${brand.appUrl}/sign-up`,
  agentSetup: `${brand.appUrl}/ai`,
  mcp: `${brand.appUrl}/mcp`,
} as const;
