import { createFileRoute, Link } from "@tanstack/react-router";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () =>
    buildPageSeo({
      title: "Privacy Policy",
      description: "OpenRank privacy policy",
      path: "/privacy",
      titleSuffix: "OpenRank",
    }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="bg-fd-background text-fd-foreground min-h-screen">
      <header className="px-6 py-4 border-b border-fd-border">
        <Link to="/" className="font-semibold text-fd-foreground hover:opacity-80">
          OpenRank
        </Link>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-12 md:py-24 prose prose-neutral dark:prose-invert text-fd-foreground prose-headings:text-fd-foreground prose-p:text-fd-muted-foreground prose-a:text-fd-foreground">
        <h1>Privacy Policy</h1>
        <p className="text-fd-muted-foreground">Last updated: March 2026</p>

      <h2>What we collect</h2>
      <p>
        When you sign up for our waitlist, we collect your email address. This
        is stored securely via Loops.so, our email service provider.
      </p>

      <h2>How we use it</h2>
      <p>
        We use your email address to send launch announcements, product updates,
        and related OpenRank marketing emails. You can unsubscribe at any time
        using the unsubscribe link in any email. We do not sell your data or
        share it with third parties beyond our service providers.
      </p>

      <h2>Website analytics</h2>
        <p>
          We use Plausible Analytics to understand aggregate website traffic and
          usage patterns (for example, page views and referring sites). Plausible
          is cookie-free and does not use cross-site tracking. We route analytics
          requests through our own domain before forwarding them to Plausible.
        </p>

      <h2>Data storage</h2>
      <p>
        Your email address is stored in Loops.so's infrastructure. You can request
        deletion of your data at any time by emailing{" "}
        <a href="mailto:privacy@everyapp.dev">privacy@everyapp.dev</a>.
      </p>

      <h2>Self-hosted usage</h2>
      <p>
        If you self-host OpenRank, no data is sent to us. The self-hosted
        version communicates directly with DataForSEO's APIs using your own
        credentials.
      </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy? Email{" "}
          <a href="mailto:privacy@everyapp.dev">privacy@everyapp.dev</a>.
        </p>
      </article>
    </div>
  );
}
