import { createFileRoute } from "@tanstack/react-router";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/_marketing/pricing")({
  head: () =>
    buildPageSeo({
      title: "Pricing",
      description:
        "OpenSEO is free to self-host. The managed service is $10/month and includes Usage Credits.",
      path: "/pricing",
      titleSuffix: "OpenSEO",
    }),
  component: Pricing,
});

function Pricing() {
  return (
    <>
      {/* Headline */}
      <h1 className="text-3xl font-bold tracking-tight">Pricing</h1>

      {/* Managed */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold">Managed</h2>
        <div className="mt-6 rounded-lg border border-neutral-200 overflow-hidden">
          {/* Base Plan */}
          <div className="px-5 py-5">
            <div className="flex items-baseline justify-between gap-4">
              <p className="font-semibold">Base Plan</p>
              <p className="text-lg font-semibold tabular-nums">$10/month</p>
            </div>
            <ul className="mt-3 space-y-2">
              {[
                "Access to OpenSEO's managed service",
                "Includes $10.00 of Usage Credits each billing cycle",
                "Monthly included credits reset each cycle",
              ].map((item) => (
                <li
                  key={item}
                  className="flex gap-2.5 text-sm text-neutral-700"
                >
                  <span className="text-neutral-400 mt-[2px] shrink-0">
                    &mdash;
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Usage Credits — add-on, visually connected to Base Plan */}
          <div className="border-t border-dashed border-neutral-200 px-5 py-5">
            <div className="flex items-baseline gap-3">
              <p className="text-sm font-semibold">Usage Credits</p>
              <span className="text-xs text-neutral-400 font-medium">
                add-on
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
              Credits are consumed as you use the app. We use powerful
              providers for AI and SEO data. We bill based on usage of those
              APIs and charge a small premium.
            </p>
            <ul className="mt-3 space-y-2">
              {[
                "Purchase top-up credits if you use up your monthly credits",
                "Top-up credits roll over and don't expire",
              ].map((item) => (
                <li
                  key={item}
                  className="flex gap-2.5 text-sm text-neutral-700"
                >
                  <span className="text-neutral-400 mt-[2px] shrink-0">
                    &mdash;
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <a
          href="https://app.openseo.so/sign-up"
          className="inline-flex items-center justify-center mt-4 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
        >
          Get Started{" "}<span aria-hidden="true" className="ml-1.5">&rarr;</span>
        </a>
      </section>

      {/* Self-hosted */}
      <section className="mt-12">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold">Self-hosted</h2>
        </div>
        <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
          Deploy OpenSEO yourself via Docker or Cloudflare Workers. Bring your
          own API keys and pay DataForSEO and other API providers directly.
        </p>
        <a
          href="https://github.com/every-app/open-seo"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-neutral-900 hover:text-neutral-600 transition-colors"
        >
          View on GitHub
          <span aria-hidden="true">&rarr;</span>
        </a>
      </section>

      {/* FAQ */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold">FAQ</h2>
        <dl className="mt-4 space-y-6">
          <div>
            <dt className="text-sm font-medium">
              What features use credits vs. what's unlimited?
            </dt>
            <dd className="mt-1 text-sm text-neutral-600 leading-relaxed">
              Credits are consumed by features that query DataForSEO's API —
              backlinks, keyword volume, competitor data, and site audits.
              Your projects, settings, and any data already fetched don't cost
              credits.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium">
              Do unused credits roll over?
            </dt>
            <dd className="mt-1 text-sm text-neutral-600 leading-relaxed">
              Top-up credits roll over indefinitely. The Usage Credits
              included with your Base Plan reset each billing cycle.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium">Can I cancel anytime?</dt>
            <dd className="mt-1 text-sm text-neutral-600 leading-relaxed">
              Yes. Cancel from your billing portal at any time. Your access
              continues through the end of the current billing period.{" "}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium">
              Do I need a subscription or just usage credits?
            </dt>
            <dd className="mt-1 text-sm text-neutral-600 leading-relaxed">
              While top-up Usage Credits roll over and don't expire, you need
              an active subscription in order to use OpenSEO.
            </dd>
          </div>
        </dl>
      </section>

    </>
  );
}
