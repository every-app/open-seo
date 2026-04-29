import { createFileRoute } from "@tanstack/react-router";
import { buildPageSeo } from "@/lib/seo";

const homeTitle = "OpenSEO - Open Source SEO Platform";
const homeDescription =
  "Own your SEO. OpenSEO helps teams manage keyword research, backlink analysis, competitor monitoring, and site audits without expensive monthly SEO software subscriptions.";

export const Route = createFileRoute("/_marketing/")({
  head: () =>
    buildPageSeo({
      title: homeTitle,
      description: homeDescription,
      path: "/",
      imageAlt: "OpenSEO keyword research dashboard preview",
    }),
  component: Home,
});

// ─── Page ────────────────────────────────────────────────────────────

function Home() {
  return (
    <>
      {/* Headline */}
      <h1 className="text-3xl font-bold tracking-tight leading-tight">
        Own your SEO
      </h1>

      <p className="text-neutral-700 mt-4 leading-relaxed">
        Open source alternative to Semrush and Ahrefs
      </p>

      {/* Features */}
      <ul className="mt-5 space-y-3">
        {[
          "Keyword Research",
          "Backlink Analysis",
          "Competitor Insights",
          "Rank Tracking",
          "AI Visibility",
        ].map((item) => (
          <li key={item} className="flex gap-2.5 text-sm text-neutral-800">
            <span className="text-neutral-500 mt-[2px]">&mdash;</span>
            {item}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div className="mt-6">
        <a
          href="https://app.openseo.so/sign-up"
          className="inline-flex items-center justify-center h-10 px-5 text-sm font-medium bg-neutral-900 text-white rounded-md hover:bg-neutral-800 transition-colors"
        >
          Try now
        </a>
        <p className="text-xs text-neutral-500 mt-3">
          No credit card required.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-8">
        {/* Self-host — after video on mobile, before on desktop */}
        <div className="order-2 md:order-1 rounded-lg border border-neutral-200 bg-neutral-50 px-5 py-5">
          <p className="text-sm font-semibold text-neutral-900">
            Self-host via Docker or Cloudflare
          </p>
          <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
            100% open source (MIT). Bring your own DataForSEO api key. Fork and
            vibe code custom features for your workflow.
          </p>
          <a
            href="https://github.com/every-app/open-seo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-neutral-900 hover:text-neutral-700 transition-colors"
          >
            View on GitHub
            <span aria-hidden="true">&rarr;</span>
          </a>
          <hr className="mt-4" />
          <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
            Don&apos;t want to self-host?{" "}
            <a
              href="https://app.openseo.so/sign-up"
              className="font-medium text-neutral-900 hover:text-neutral-700 transition-colors"
            >
              Try the managed version.
            </a>
          </p>
        </div>

        {/* Demo */}
        <div className="order-1 md:order-2">
          <video
            className="w-full rounded-md border border-neutral-200"
            width={1280}
            height={808}
            poster="/demo-poster.webp"
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            aria-label="OpenSEO product demo"
          >
            <source src="/demo.webm" type="video/webm" />
            <source src="/demo.mp4" type="video/mp4" />
            <img
              src="/demo-poster.webp"
              alt="OpenSEO product demo"
              width={1280}
              height={808}
              className="w-full rounded-md border border-neutral-200"
              loading="lazy"
              decoding="async"
            />
          </video>
          <p className="text-[11px] text-neutral-600 mt-2">
            Keyword research in OpenSEO
          </p>
        </div>
      </div>
    </>
  );
}
