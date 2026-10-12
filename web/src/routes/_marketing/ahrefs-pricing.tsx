import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody } from "fumadocs-ui/page";
import AhrefsPricingContent, {
  frontmatter,
} from "../../../content/marketing/ahrefs-pricing.mdx";
import { buildPageSeo, SITE_URL, toCanonicalUrl } from "@/lib/seo";

const PATH = "/ahrefs-pricing";
// Every price on this page was verified against ahrefs.com/pricing,
// help.ahrefs.com, and the competitors' pricing pages on this date. Re-check
// them whenever you bump it.
const UPDATED = "2026-10-05";

const webPageLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: frontmatter.title,
  description: frontmatter.description,
  url: toCanonicalUrl(PATH),
  dateModified: UPDATED,
  about: {
    "@type": "SoftwareApplication",
    name: "Ahrefs",
    url: "https://ahrefs.com/",
  },
  publisher: { "@type": "Organization", name: "OpenSEO", url: SITE_URL },
};

export const Route = createFileRoute("/_marketing/ahrefs-pricing")({
  head: () =>
    buildPageSeo({
      title: "Ahrefs Pricing in 2026 - Plans, Credits, Starter vs Lite",
      description: frontmatter.description,
      path: PATH,
      ogType: "article",
    }),
  component: AhrefsPricingPage,
});

function AhrefsPricingPage() {
  return (
    <article className="mx-auto max-w-4xl text-neutral-900">
      <header className="mb-10 border-b border-[var(--color-border-subtle)] pb-8">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          Ahrefs pricing
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          {frontmatter.title}
        </h1>
        {frontmatter.description ? (
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--color-brand-muted)]">
            {frontmatter.description}
          </p>
        ) : null}
      </header>

      <DocsBody className="min-w-0 text-neutral-800 [&_a]:!text-neutral-950 [&_h2]:!text-neutral-950 [&_h2_a]:!no-underline [&_h3]:!text-neutral-950 [&_h3_a]:!no-underline [&_h4]:!text-neutral-950 [&_h4_a]:!no-underline [&_h5_a]:!no-underline [&_h6_a]:!no-underline [&_li]:!text-neutral-700 [&_li_a]:font-medium [&_li_a]:underline [&_li_a]:decoration-[var(--color-brand-accent)] [&_li_a]:underline-offset-4 [&_li_a:hover]:!text-neutral-700 [&_p]:!text-neutral-700 [&_p_a]:font-medium [&_p_a]:underline [&_p_a]:decoration-[var(--color-brand-accent)] [&_p_a]:underline-offset-4 [&_p_a:hover]:!text-neutral-700 [&_strong]:!text-neutral-950">
        <AhrefsPricingContent components={defaultMdxComponents} />
      </DocsBody>

      <section className="mt-14 rounded-xl border border-[var(--color-border-subtle)] bg-white p-6">
        <p className="text-xl font-semibold tracking-tight text-neutral-950">
          Running out of Ahrefs credits?
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          OpenSEO covers keyword research, backlinks, competitor research, rank
          tracking, and site audits from $10 a month, with $10 of usage
          included. You pay for new data, not for every report you open.{" "}
          <a
            href="/ahrefs-alternative"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            See how it compares to Ahrefs
          </a>
          .
        </p>
        <div className="mt-5">
          <a
            href="https://app.openseo.so/sign-up"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Start free trial
            <span className="ml-2" aria-hidden="true">
              &rarr;
            </span>
          </a>
        </div>
      </section>

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd) }}
      />
    </article>
  );
}
