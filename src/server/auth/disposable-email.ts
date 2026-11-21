import { APIError } from "better-auth/api";
import { z } from "zod";
import {
  SIGN_UP_EMAIL_REFUSED_CODE,
  SIGN_UP_EMAIL_REFUSED_MESSAGE,
} from "@/shared/sign-up-email";

// The free plan grants real credit spend off nothing but a working inbox, so
// the cheapest way to farm it is a throwaway mail service. Hosted sign-up
// refuses an address two ways: its domain is on the public list of such
// services (the disposable-email-domains-js package, plus a few names of our
// own), or the domain's mail is received by a throwaway service's mail host.
// The second catches a domain minted yesterday, which no list has yet.

enum SignUpEmailOutcome {
  Accepted = "accepted",
  ListedDomain = "listed_domain",
  ThrowawayMailHost = "throwaway_mail_host",
  MailHostLookupFailed = "mail_host_lookup_failed",
}

// Names the public list lacks: ones sign-up refused before it used the list,
// and domains that farmed free credits here from mail servers of their own,
// which the mail-host check cannot see.
const EXTRA_LISTED_DOMAINS = [
  "0clock.net",
  "33mail.com",
  "burnermail.io",
  "dvdee.com",
  "emailnox.live",
  "mail-temp.com",
  "temp-mail.io",
  "tempmail.com",
  "tempmail.dev",
];

// Mail hosts of throwaway services, matched with their subdomains. A host is
// here only if all of this held when it was added: 100 or more domains on the
// public list receive mail there, or accounts farming free credits here did;
// none of the million most visited sites does, other than the service's own
// and listed ones; and no account on it here was paying. A general mail
// provider, forwarder or parking service never belongs in this list.
const THROWAWAY_MAIL_HOSTS = [
  "10mail.org",
  "10mail.xyz",
  "10minutemail.com",
  "215.im",
  "aerospaceemail.com",
  "beavis99.com",
  "beavis99.net",
  "breakthur.com",
  "brushemail.com",
  "bumpemail.com",
  "casadorock.com",
  "catchservers.com",
  "catchservers.net",
  "chatgpt.org.uk",
  "donthateanyone.com",
  "dropmail.me",
  "emailfake.com",
  "emailqu.com",
  "emlhub.com",
  "emlpro.com",
  "emltmp.com",
  "erinn.biz",
  "fex.plus",
  "freeml.net",
  "generator.email",
  "gravityengine.cc",
  "mail.cx",
  "mailcore.email",
  "mailinator.com",
  "mainnetmail.com",
  "mimimail.me",
  "moakt.com",
  "mxcomet.com",
  "mxstorm.com",
  "oneb.net",
  "priyohost.net",
  "rejecthost.com",
  "smtp.is",
  "spymail.one",
  "tinyhost.shop",
  "unstablemail.com",
  "vietxf.com",
  "wabblywabble.com",
  "wallywatts.com",
  "yomail.info",
  "yopmail.com",
];

const MX_LOOKUP_URL = "https://cloudflare-dns.com/dns-query";
const MX_LOOKUP_TIMEOUT_MS = 1_500;
const MX_RECORD_TYPE = 15;
const DNS_NO_ERROR = 0;
const DNS_NAME_ERROR = 3;

const mxLookupSchema = z.object({
  Status: z.number(),
  Answer: z.array(z.object({ type: z.number(), data: z.string() })).optional(),
});

/** Better Auth's routes for the redirect back from Google and ChatGPT. */
const OAUTH_CALLBACK_PATHS = ["/callback/:id", "/oauth2/callback/:providerId"];

/**
 * Refuses a hosted sign-up from a throwaway mail service. `path` is the
 * Better Auth route creating the user.
 */
export async function assertSignUpEmailAccepted(
  email: string,
  path: string | undefined,
) {
  const domain = email
    .slice(email.lastIndexOf("@") + 1)
    .trim()
    .toLowerCase();
  const outcome = await checkEmailDomain(domain);
  if (
    outcome !== SignUpEmailOutcome.ListedDomain &&
    outcome !== SignUpEmailOutcome.ThrowawayMailHost
  ) {
    return;
  }
  console.warn("sign_up:email_check", { outcome, domain });
  throw new APIError("BAD_REQUEST", {
    // The sign-up form shows the message as it is. After Google or ChatGPT,
    // Better Auth redirects to /auth-error with the message as its code.
    message:
      path && OAUTH_CALLBACK_PATHS.includes(path)
        ? SIGN_UP_EMAIL_REFUSED_CODE
        : SIGN_UP_EMAIL_REFUSED_MESSAGE,
  });
}

async function checkEmailDomain(domain: string): Promise<SignUpEmailOutcome> {
  if (await isListedDomain(domain)) return SignUpEmailOutcome.ListedDomain;
  let mailHosts: string[];
  try {
    mailHosts = await lookUpMailHosts(domain);
  } catch (error) {
    // The one place this check gives way: when the lookup times out or errors
    // the sign-up goes ahead, because a real person must never be refused, or
    // kept waiting longer than the timeout, over our DNS request failing.
    // Logged under the same name as a refusal, so both rates can be read
    // against sign-ups.
    const outcome = SignUpEmailOutcome.MailHostLookupFailed;
    console.warn("sign_up:email_check", { outcome, domain, error });
    return outcome;
  }
  return mailHosts.some(isThrowawayMailHost)
    ? SignUpEmailOutcome.ThrowawayMailHost
    : SignUpEmailOutcome.Accepted;
}

async function isListedDomain(domain: string) {
  if (EXTRA_LISTED_DOMAINS.includes(domain)) return true;
  // Imported on an isolate's first sign-up, not at startup: the list is
  // thousands of names that only this check reads.
  const { isDisposableEmailDomain } =
    await import("disposable-email-domains-js");
  return isDisposableEmailDomain(domain);
}

/** The domain's MX hosts. Sends the domain alone, never the address. */
async function lookUpMailHosts(domain: string) {
  const response = await fetch(
    `${MX_LOOKUP_URL}?name=${encodeURIComponent(domain)}&type=MX`,
    {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(MX_LOOKUP_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`MX lookup answered HTTP ${response.status}`);
  }
  const lookup = mxLookupSchema.parse(await response.json());
  // A name that does not exist has no mail host; any other status is a
  // resolver failure.
  if (lookup.Status !== DNS_NO_ERROR && lookup.Status !== DNS_NAME_ERROR) {
    throw new Error(`MX lookup answered DNS status ${lookup.Status}`);
  }
  return (lookup.Answer ?? [])
    .filter((record) => record.type === MX_RECORD_TYPE)
    .map((record) => {
      // "10 mx.example.com."
      const host = record.data.slice(record.data.lastIndexOf(" ") + 1);
      return host.replace(/\.$/, "").toLowerCase();
    });
}

function isThrowawayMailHost(mailHost: string) {
  return THROWAWAY_MAIL_HOSTS.some(
    (service) => mailHost === service || mailHost.endsWith(`.${service}`),
  );
}
