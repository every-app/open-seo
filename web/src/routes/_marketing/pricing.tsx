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
    <article className="mx-auto max-w-5xl">
      <p className="text-sm font-medium text-[var(--color-brand-accent)]">
        Pricing
      </p>
      <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
        Start small, scale by usage
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--color-brand-muted)]">
        Use the managed app for $10/month, or self-host OpenSEO with your own
        API keys.
      </p>

      {/* Managed */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Managed
        </h2>
        <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-border-subtle)] bg-white">
          {/* Base Plan */}
          <div className="p-6">
            <div className="flex items-baseline justify-between gap-4">
              <p className="font-semibold text-neutral-950">Base Plan</p>
              <p className="text-xl font-semibold tabular-nums text-neutral-950">
                $10/month
              </p>
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
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-accent)]">
                    <span className="sr-only">Included:</span>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Usage Credits — add-on, visually connected to Base Plan */}
          <div className="border-t border-dashed border-[var(--color-border-subtle)] bg-[#fbfaf8] p-6">
            <div className="flex items-baseline gap-3">
              <p className="text-sm font-semibold text-neutral-950">
                Usage Credits
              </p>
              <span className="text-xs font-medium text-[var(--color-brand-muted)]">
                add-on
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
              Credits are consumed as you use the app. We use powerful providers
              for AI and SEO data. We bill based on usage of those APIs and
              charge a small premium.
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
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-accent)]">
                    <span className="sr-only">Included:</span>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <a
          href="https://app.openseo.so/sign-up"
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Get Started{" "}
          <span aria-hidden="true" className="ml-1.5">
            &rarr;
          </span>
        </a>
      </section>

      {/* Self-hosted */}
      <section className="mt-12 rounded-xl border border-[var(--color-border-subtle)] bg-white p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Self-hosted
          </h2>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Deploy OpenSEO yourself via Docker or Cloudflare Workers. Bring your
          own API keys and pay DataForSEO and other API providers directly.
        </p>
        <a
          href="https://github.com/every-app/open-seo"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-950 transition-colors hover:text-[var(--color-brand-accent)]"
        >
          View on GitHub
          <span aria-hidden="true">&rarr;</span>
        </a>
      </section>

      {/* FAQ */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          FAQ
        </h2>
        <dl className="mt-5 divide-y divide-[var(--color-border-subtle)] rounded-xl border border-[var(--color-border-subtle)] bg-white">
          <div className="p-5">
            <dt className="text-sm font-medium text-neutral-950">
              What if I use all my included credits?
            </dt>
            <dd className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
              You'll never have unexpected costs or bills. If you use all your
              credits, you'll see errors when you try to do tasks. You can
              purchase more top up credits at any time.
            </dd>
          </div>
          <div className="p-5">
            <dt className="text-sm font-medium text-neutral-950">
              What features use credits?
            </dt>
            <dd className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
              Credits are consumed by features that query DataForSEO's API —
              backlinks, keyword volume, competitor data, and site audits. Your
              projects, settings, and any data already fetched don't cost
              credits.
            </dd>
          </div>
          <div className="p-5">
            <dt className="text-sm font-medium text-neutral-950">
              Do unused credits roll over?
            </dt>
            <dd className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
              Top-up credits roll over indefinitely. The Usage Credits included
              with your Base Plan reset each billing cycle.
            </dd>
          </div>
          <div className="p-5">
            <dt className="text-sm font-medium text-neutral-950">
              Can I cancel anytime?
            </dt>
            <dd className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
              Yes. Cancel from your billing portal at any time. Your access
              continues through the end of the current billing period.{" "}
            </dd>
          </div>
          <div className="p-5">
            <dt className="text-sm font-medium text-neutral-950">
              Do I need a subscription or just usage credits?
            </dt>
            <dd className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
              While top-up Usage Credits roll over and don't expire, you need an
              active subscription in order to use OpenSEO.
            </dd>
          </div>
        </dl>
      </section>
    </article>
  );
}
