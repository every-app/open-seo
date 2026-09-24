// Single source of truth for everything that names or links to the product.
//
// Every user-visible product name, marketing/docs/legal link, support address
// and outbound identifier is read from here so a rebrand is a one-file change. Internal identifiers (MCP tool names, skill slugs, wrangler
// resource names, database ids) are deliberately NOT branded: renaming them
// would break installed agents and orphan existing databases.
//
// Values are plain constants rather than environment variables: they are the
// same in every environment of one deployment and several are needed in code
// that has no runtime env (client bundles, markdown templates, OG images).
// Set them once, before the first deploy.
//
// Anything ending in `Url` must be an absolute https URL with no trailing
// slash. The `.example` hosts below are RFC 2606 placeholders — replace them.

export const brand = {
  // Product name as shown in the UI, page titles, emails and the MCP server.
  name: "SEOShark",
  // Short descriptor used in metadata and agent-facing text.
  tagline: "All-in-one SEO tool for you and your AI agent",
  // Marketing site (landing page, pricing, docs, legal pages).
  marketingUrl: "https://seoshark.example",
  // Hosted app origin. Only a fallback for places that cannot read the request
  // origin or BETTER_AUTH_URL (static agent instructions, OG redirects).
  appUrl: "https://app.seoshark.example",
  docsUrl: "https://seoshark.example/docs",
  pricingUrl: "https://seoshark.example/pricing",
  termsUrl: "https://seoshark.example/terms-and-conditions",
  privacyUrl: "https://seoshark.example/privacy",
  // Human support channel shown in the app and quoted by the in-app agent.
  supportEmail: "support@seoshark.example",
  // Optional community links. Leave undefined to hide the corresponding UI.
  discordUrl: undefined as string | undefined,
  githubUrl: "https://github.com/bizztor/seoshark",
  // Sender identity for automated rows that need an email (scheduled jobs).
  systemEmail: "system@seoshark.example",
  // Square icon (>= 512px) referenced by MCP clients and OG images.
  iconUrl: "https://seoshark.example/android-chrome-512x512.png",
  // Social preview image for shared reports.
  socialCardUrl: "https://seoshark.example/social-card.jpg",
  // Outbound User-Agent for the onboarding site scraper and audit crawler.
  userAgent: "SEOShark/1.0 (+https://seoshark.example)",
  // Tag attached to CRM contacts created at signup (Loops `source`).
  signupSource: "seoshark-signup",
  // Anonymous self-host usage heartbeat (install counts only). Off unless
  // pointed at your own PostHog project; it never reports anywhere else.
  selfHostTelemetry: undefined as
    | { posthogKey: string; host: string }
    | undefined,
} as const;
