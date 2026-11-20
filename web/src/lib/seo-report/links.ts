// Where a report's links may go, and the links the tool itself makes.

const OPENSEO = "openseo.so";

/** Whether `host` is `site` or a name under it, so app.example.com counts as example.com. */
export const within = (host: string, site: string) =>
  host === site || host.endsWith(`.${site}`);

/**
 * Whether a report about `site` may link to `address`: its own site, a site
 * named on a results page it checked (`hosts`), or openseo.so.
 */
export function mayLink(
  address: string | undefined,
  site: string,
  hosts: readonly string[],
): boolean {
  if (!address) return false;
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return within(host, site) || within(host, OPENSEO) || hosts.includes(host);
}

/** The link in a report's email. It downloads the report as a PDF (routes/_marketing/seo-report_.r.$token.tsx). */
export const reportPath = (token: string) => `/seo-report/r/${token}`;

/**
 * Where someone is sent to make an OpenSEO account. Onboarding fills the site
 * in from `domain`. `from` says where the link was: the form's site for the
 * email, or the report itself.
 */
export function signupUrl(site: string, from: string) {
  const url = new URL("https://app.openseo.so/sign-up");
  url.searchParams.set("domain", site);
  url.searchParams.set("utm_source", "seo-report");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_content", from);
  return url.href;
}
