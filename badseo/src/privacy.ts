import { renderShell } from "./lib";

/** Standalone privacy policy for badseo.dev and its optional GA4 analytics. */
export function renderPrivacy(): string {
  return renderShell({
    title: "Privacy policy | badseo.dev",
    metaDescription:
      "How badseo.dev uses optional Google Analytics, necessary consent storage, and Cloudflare infrastructure.",
    bodyHtml: `<article class="legal-page">
  <header class="legal-head">
    <span class="legal-kicker">BADSEO.DEV / PRIVACY</span>
    <h1>Privacy policy</h1>
    <p class="legal-version"><span>Policy version</span> July 10, 2026</p>
    <p class="lede">This policy explains what badseo.dev processes when you visit, what remains off until you choose otherwise, and how to change that choice.</p>
  </header>

  <div class="legal-summary">
    <strong>The short version</strong>
    <p>If optional analytics is enabled, Google Analytics stays completely off unless you accept it. Rejecting does not change the site, and you can later change your choice through <strong>Cookie settings</strong>. When analytics is disabled at the site level, no consent controls appear because no Google Analytics code can run.</p>
  </div>

  <section>
    <h2>Who operates this site</h2>
    <p>badseo.dev is operated by Every App, Inc. It is a public test site maintained by the team behind OpenSEO. It contains no accounts, forms, purchases, or user-submitted content.</p>
    <p>Privacy questions and requests can be sent to <a href="mailto:ben@openseo.so">ben@openseo.so</a>.</p>
  </section>

  <section>
    <h2>What is necessary to run the site</h2>
    <p>Cloudflare serves badseo.dev and therefore receives ordinary request information such as your IP address, request headers, requested URL, and time of access. We use Cloudflare to deliver and secure the site, store consent records, and rate-limit the consent endpoint. Cloudflare uses the request IP transiently for that rate limit; we do not write it to the consent ledger described below.</p>
    <p>badseo.dev does not create a separate visitor access-log database. Cloudflare may retain platform request and security data under our service configuration and its legal requirements. We use that processing only for delivery, security, abuse prevention, and diagnosing operational failures.</p>
  </section>

  <section>
    <h2>Optional Google Analytics</h2>
    <p>When the optional analytics feature is enabled, badseo.dev uses Google Analytics 4, provided by Google LLC, only after you select <strong>Accept analytics</strong>. Before that choice, all four Google Consent Mode signals are denied and the Google tag is not loaded, so badseo.dev sends no analytics request or cookieless consent-mode ping to Google. When the feature is disabled, the tag and Consent Mode bootstrap are both absent.</p>
    <p>When enabled, Google Analytics receives the page URL with its query string and fragment removed, a similarly limited referring URL, browser and device information, timestamps, approximate location derived from your IP address, and randomly generated client and session identifiers. If outbound-click measurement is enabled, it also receives the full destination URL and related link metadata. We use this information to understand aggregate traffic, which technical-SEO examples people use, and which outbound links they follow.</p>
    <p>Google Analytics uses first-party cookies named <code>_ga</code> and <code>_ga_&lt;container-id&gt;</code> to distinguish visitors and sessions. Google documents a default cookie expiration of up to two years, subject to browser limits and deletion by you.</p>
    <p>The Worker remains analytics-off until we have verified that the Google Analytics property uses fourteen-month user-level and event-level data retention, does not use User-ID, is not linked to Google Ads, and has the documented sharing and measurement settings. Google's retention setting does not apply to aggregated standard reports, which may remain available longer.</p>
    <p>The site tag itself disables Google Signals and advertising-personalization signals and keeps all advertising consent signals denied.</p>
  </section>

  <section>
    <h2>How your choice is recorded</h2>
    <p>We store your choice, the applicable notice and policy versions, the relevant measurement identifier, the time of the choice, and—after a grant—a randomly generated receipt identifier in necessary local browser storage. We use that record only to remember and apply your preference. We treat it as expired after 400 days and remove it on your next visit. Separate necessary retry markers may be retained for failed withdrawal events until they are successfully written or reach the same 400-day limit.</p>
    <p>When you accept analytics, a same-origin Cloudflare Worker must save an operator-accessible consent event before Google Analytics can load. That append-only event contains the pseudonymous receipt identifier, server-recorded date and time, grant state, measurement identifier, and an exact copy and version of the notice and choices shown. A later withdrawal creates a separate event. We retain each event in Cloudflare Workers KV for up to 830 days so evidence of the choice remains available throughout the possible 400-day grant and the following fourteen-month user-level and event-level retention window. This evidence period does not determine how long aggregated Google Analytics reports remain available.</p>
    <p>We do not include your raw IP address or browser user-agent string in this ledger, and we do not keep separate exports of it.</p>
  </section>

  <section>
    <h2>Rejecting or withdrawing</h2>
    <p>When optional analytics is enabled, you can reject it without losing access to any page. You can later grant or withdraw consent through <strong>Cookie settings</strong> on badseo.dev pages.</p>
    <p>Withdrawal immediately denies analytics in active badseo.dev tabs, takes effect in suspended tabs when they resume, removes the Google Analytics cookies accessible to this site, and prevents the Google tag from loading on later page views. It does not wait for the withdrawal event to be written. If that write fails and necessary browser storage is available, the browser retains a pending marker for each affected receipt and retries on a later page view. If preference storage is unavailable, the page still attempts the write immediately but cannot retain a retry marker; analytics remains off either way. Withdrawal does not affect processing that lawfully occurred before it.</p>
  </section>

  <section>
    <h2>Service providers and international processing</h2>
    <p>Cloudflare provides hosting, request security, rate limiting, and the consent-event store. Google provides Google Analytics only after consent. These providers may process information in the United States and other countries. Where required, their applicable terms use recognized transfer mechanisms such as adequacy decisions or standard contractual clauses. Contact us for more information about the safeguards relevant to your request.</p>
    <p>Learn more about <a href="https://policies.google.com/technologies/partner-sites">how Google uses information from sites or apps that use its services</a>, <a href="https://policies.google.com/privacy">Google's privacy practices</a>, and <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare's privacy practices</a>.</p>
  </section>

  <section>
    <h2>Why we process this information</h2>
    <p>Where data-protection law requires a legal basis, we rely on your consent for optional Google Analytics. We process the limited information needed to deliver and secure the site, prevent abuse, remember your preference, and maintain consent evidence because those activities are necessary to provide the site and support our legitimate interests in operating it securely and demonstrating your choice.</p>
  </section>

  <section>
    <h2>Your privacy rights</h2>
    <p>Depending on where you live, you may have rights to ask about, access, correct, delete, restrict, or object to certain processing of your information. Contact <a href="mailto:ben@openseo.so">ben@openseo.so</a> to make a request. For a request concerning a pseudonymous consent record, we may provide instructions for retrieving the receipt identifier from your browser so we can locate the matching events. You may also complain to the data-protection or privacy authority where you live.</p>
  </section>

  <section>
    <h2>Changes to this policy</h2>
    <p>We will update the version date above when this policy changes. If the analytics vendor, measurement destination, purpose, choices, or material notice wording changes, badseo.dev will disregard any affected browser grant and ask again before enabling analytics.</p>
  </section>
</article>`,
  });
}
