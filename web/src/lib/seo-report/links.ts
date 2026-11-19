// Where a report's links may go, and the links the tool itself makes. Shared
// by the Worker and the report page, so it imports nothing.

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
  // A link within the report page itself, such as "#method".
  if (address.startsWith("#")) return true;
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

const REPORT_PATH_PREFIX = "/seo-report/r/";
export const reportPath = (token: string) => `${REPORT_PATH_PREFIX}${token}`;

/**
 * Whether a page is a written report. Its address is the only way to it, so
 * nothing that records page addresses runs there: no Plausible, no
 * OpenAnalytics, no Meta Pixel.
 */
export const isReportPath = (pathname: string) =>
  pathname.startsWith(REPORT_PATH_PREFIX);

/** The same test as a line of browser JavaScript, for the script in the page's head. */
export const IS_REPORT_PATH_JS = `location.pathname.indexOf(${JSON.stringify(REPORT_PATH_PREFIX)})===0`;

/**
 * Where someone is sent to make an OpenSEO account. Onboarding fills the site
 * in from `domain`. `from` says where the link was: the form's site for the
 * email, or the report page.
 */
export function signupUrl(site: string, from: string) {
  const url = new URL("https://app.openseo.so/sign-up");
  url.searchParams.set("domain", site);
  url.searchParams.set("utm_source", "seo-report");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_content", from);
  return url.href;
}
