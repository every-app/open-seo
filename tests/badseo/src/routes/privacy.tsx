import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "../components/site-layout";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy | badseo.dev" },
      {
        name: "description",
        content:
          "How badseo.dev uses Plausible, Google Analytics, and Cloudflare and how visitors control analytics cookies.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <SiteLayout>
      <main className="main">
        <h1>Privacy policy</h1>
        <p className="lede">
          This policy explains the limited information processed when you visit
          badseo.dev. Last updated July 10, 2026.
        </p>

        <h2>Who operates this site</h2>
        <p>
          badseo.dev is operated by Every App, Inc. as a public test site for
          OpenSEO. The site has no accounts, forms, purchases, or user-submitted
          content. Privacy questions and requests can be sent to{" "}
          <a href="mailto:ben@openseo.so">ben@openseo.so</a>.
        </p>

        <h2>Plausible Analytics</h2>
        <p>
          We use Plausible Analytics on every page to understand aggregate
          traffic and which technical SEO examples people use. Plausible does
          not set cookies or create a persistent identifier for you. It provides
          aggregate measurements such as page views, referring sites, browser
          and device categories, and country-level location.
        </p>
        <p>
          Plausible is provided by Plausible Analytics OÜ. Learn more in the{" "}
          <a href="https://plausible.io/data-policy">
            Plausible Analytics data policy
          </a>
          .
        </p>

        <h2>Google Analytics</h2>
        <p>
          Separately, with your permission, we use Google Analytics 4 to
          understand traffic in the analytics product many OpenSEO users use.
          The Google tag does not load until you select <strong>Accept</strong>
          in the analytics banner.
        </p>
        <p>
          Google Analytics may process the page address and title, referring
          page, interactions such as page views, scrolls, and outbound clicks,
          browser and device information, approximate location derived from your
          IP address, and randomly generated identifiers. It may set first-party
          cookies including <code>_ga</code> and{" "}
          <code>_ga_&lt;container-id&gt;</code> to distinguish visitors and
          sessions.
        </p>
        <p>
          If you reject analytics, no Google Analytics request is made. Your
          choice is stored in your browser&apos;s local storage so the site can
          remember it. You can change your choice at any time using{" "}
          <strong>Cookie settings</strong> in the footer. Rejecting after a
          previous acceptance disables analytics and removes accessible Google
          Analytics cookies from this site. This choice controls Google
          Analytics; the cookieless Plausible measurement described above
          remains active.
        </p>
        <p>
          Learn more about{" "}
          <a href="https://policies.google.com/technologies/partner-sites">
            how Google uses information from sites that use its services
          </a>{" "}
          and{" "}
          <a href="https://policies.google.com/privacy">
            Google&apos;s privacy practices
          </a>
          .
        </p>

        <h2>Cloudflare</h2>
        <p>
          Cloudflare hosts, delivers, and protects badseo.dev. It receives
          ordinary request information such as your IP address, request headers,
          requested URL, and time of access to provide the site, prevent abuse,
          and diagnose failures. We do not create a separate visitor access-log
          database. Learn more in{" "}
          <a href="https://www.cloudflare.com/privacypolicy/">
            Cloudflare&apos;s privacy policy
          </a>
          .
        </p>

        <h2>International processing and your rights</h2>
        <p>
          Google, Plausible, and Cloudflare may process information in the
          United States, the European Economic Area, and other countries.
          Depending on where you live, you may have rights to ask about, access,
          correct, delete, restrict, or object to certain processing of your
          information. Contact us to make a request. You may also complain to
          the privacy or data-protection authority where you live.
        </p>

        <h2>Changes</h2>
        <p>
          We will update the date above when this policy changes materially.
        </p>
      </main>
    </SiteLayout>
  );
}
