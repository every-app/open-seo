// A curated blocklist of the highest-volume disposable / throwaway email
// providers. The free plan grants real credit spend off nothing but a verified
// email, so the cheapest way to farm it is a temp-inbox service that can still
// receive the verification link. Blocking the busiest of those raises the cost
// of mass signups without touching legitimate users.
//
// This is deliberately a small, zero-dependency list — it is not exhaustive.
// For comprehensive coverage, swap this for the `disposable-email-domains`
// package or a captcha on signup (see the PR notes).
const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  "0clock.net",
  "10minutemail.com",
  "20minutemail.com",
  "33mail.com",
  "burnermail.io",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "inboxbear.com",
  "inboxkitten.com",
  "mail-temp.com",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "moakt.com",
  "mohmal.com",
  "mytemp.email",
  "sharklasers.com",
  "spam4.me",
  "temp-mail.io",
  "temp-mail.org",
  "tempmail.com",
  "tempmail.dev",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.de",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
]);

export function isDisposableEmailDomain(email: string): boolean {
  const domain = email.split("@").at(-1)?.trim().toLowerCase();
  return domain !== undefined && DISPOSABLE_EMAIL_DOMAINS.has(domain);
}
