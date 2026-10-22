// Optional tracking choices shared by the marketing site (openseo.so) and the
// app (app.openseo.so). Both read one first-party cookie on `.openseo.so`, so a
// choice made on either side applies to both. Necessary cookies (sign-in,
// security, this cookie) are not optional and are not covered here.

export type PrivacyChoices = {
  /** PostHog product analytics in the app: events, errors and masked
   *  session recordings. The website's visit statistics are cookieless and
   *  not covered here. */
  analytics: boolean;
  /** Partner referral attribution (Dub's referral cookie). */
  referrals: boolean;
  /** Meta ad measurement: the Meta Pixel on openseo.so and the app's signup
   *  and subscription events to Meta's Conversions API. */
  advertising: boolean;
};

/** Choices as saved in the cookie. A cookie saved before Meta had its own
 *  choice has no `advertising`, so the region default applies to it. */
type SavedPrivacyChoices = Omit<PrivacyChoices, "advertising"> & {
  advertising?: boolean;
};

const PRIVACY_COOKIE = "openseo_privacy";
const PRIVACY_COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

// For visitors from these countries nothing optional runs until they opt in.
// Everywhere else optional tracking is on until the visitor opts out. EEA
// (EU + Iceland, Liechtenstein, Norway), UK and Switzerland. The second line
// is EU regions that report their own code (French overseas regions, Åland),
// then Gibraltar and the Crown Dependencies, which follow GDPR-style rules.
const OPT_IN_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "GB", "CH",
  "RE", "GP", "MQ", "GF", "YT", "MF", "AX", "GI", "JE", "GG", "IM",
]); // prettier-ignore

/** `country` is Cloudflare's CF-IPCountry. Unknown or anonymized (XX, T1)
 *  locations get the opt-in treatment. */
export function requiresOptIn(country: string | null | undefined): boolean {
  if (!country || country.length !== 2) return true;
  if (country === "XX" || country === "T1") return true;
  return OPT_IN_COUNTRIES.has(country.toUpperCase());
}

/** Whether a new account starts with product-update emails on. Every email
 *  carries an unsubscribe link, which is enough in opt-out regions like the
 *  US. Off where tracking needs opt-in, and in Canada, whose anti-spam law
 *  doesn't accept a pre-ticked box as consent. */
export function productUpdatesOnByDefault(
  country: string | null | undefined,
): boolean {
  return !requiresOptIn(country) && country?.toUpperCase() !== "CA";
}

export function defaultPrivacyChoices(optIn: boolean): PrivacyChoices {
  return { analytics: !optIn, referrals: !optIn, advertising: !optIn };
}

/** Saved choices from a Cookie header or `document.cookie`, or null when the
 *  visitor hasn't chosen yet (or the cookie is unreadable). */
export function readPrivacyCookie(
  cookieHeader: string | null | undefined,
): SavedPrivacyChoices | null {
  const raw = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PRIVACY_COOKIE}=`))
    ?.slice(PRIVACY_COOKIE.length + 1);
  // Format: "a1.d0.m1" — analytics, Dub referrals, Meta advertising. Cookies
  // saved before the Meta choice existed stop after the "d" flag.
  const match = /^a([01])\.d([01])(?:\.m([01]))?$/.exec(raw ?? "");
  if (!match) return null;
  return {
    analytics: match[1] === "1",
    referrals: match[2] === "1",
    advertising: match[3] ? match[3] === "1" : undefined,
  };
}

/** Choices that apply right now: the saved ones, with the region default for
 *  any the visitor hasn't made. Global Privacy Control always turns off
 *  advertising and referral tracking, whatever was saved. */
export function effectivePrivacyChoices(args: {
  saved: SavedPrivacyChoices | null;
  optIn: boolean;
  globalPrivacyControl: boolean;
}): PrivacyChoices {
  const defaults = defaultPrivacyChoices(args.optIn);
  const choices = args.saved
    ? {
        ...args.saved,
        advertising: args.saved.advertising ?? defaults.advertising,
      }
    : defaults;
  return args.globalPrivacyControl
    ? { ...choices, referrals: false, advertising: false }
    : choices;
}

/** The choices that apply to a request: the browser's saved choices, or the
 *  defaults for its location, under its Global Privacy Control header. */
export function requestPrivacyChoices(
  request: Request | undefined,
): PrivacyChoices {
  return effectivePrivacyChoices({
    saved: readPrivacyCookie(request?.headers.get("cookie")),
    optIn: requiresOptIn(request?.headers.get("cf-ipcountry")),
    globalPrivacyControl: request?.headers.get("sec-gpc") === "1",
  });
}

// ---- Browser helpers ----

export function hasGlobalPrivacyControl(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Reflect.get(navigator, "globalPrivacyControl") === true
  );
}

function cookieDomainAttribute(): string {
  const host = location.hostname;
  return host === "openseo.so" || host.endsWith(".openseo.so")
    ? "; Domain=openseo.so"
    : "";
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}${cookieDomainAttribute()}`;
}

const flag = (value: boolean) => (value ? "1" : "0");

export function savePrivacyChoices(choices: PrivacyChoices) {
  writeCookie(
    PRIVACY_COOKIE,
    `a${flag(choices.analytics)}.d${flag(choices.referrals)}.m${flag(choices.advertising)}`,
    PRIVACY_COOKIE_MAX_AGE_SECONDS,
  );
  // Withdrawing referral permission removes Dub's cookies so a later signup
  // isn't attributed to the partner. Sales of a customer attributed at signup
  // are still reported from the server.
  if (!choices.referrals) {
    for (const name of ["dub_id", "dub_partner_data"]) writeCookie(name, "", 0);
  }
  // Withdrawing advertising permission removes the Meta Pixel's browser and
  // click ids, so a later signup isn't attributed to an ad.
  if (!choices.advertising) {
    for (const name of ["_fbp", "_fbc"]) writeCookie(name, "", 0);
  }
  window.dispatchEvent(new Event(PRIVACY_CHOICES_CHANGED_EVENT));
}

export const PRIVACY_CHOICES_CHANGED_EVENT = "openseo:privacy-choices-changed";
