import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody } from "fumadocs-ui/page";
import OpenseoVsDataforseoContent, {
  frontmatter,
} from "../../../content/marketing/openseo-vs-dataforseo.mdx";
import { buildPageSeo, SITE_URL, toCanonicalUrl } from "@/lib/seo";

const PATH = "/openseo-vs-dataforseo";
const UPDATED = "2026-10-07";

const webPageLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: frontmatter.title,
  description: frontmatter.description,
  url: toCanonicalUrl(PATH),
  dateModified: UPDATED,
  about: [
    { "@type": "SoftwareApplication", name: "OpenSEO", url: SITE_URL },
    {
      "@type": "SoftwareApplication",
      name: "DataForSEO",
      url: "https://dataforseo.com/",
    },
  ],
};

export const Route = createFileRoute("/_marketing/openseo-vs-dataforseo")({
  head: () =>
    buildPageSeo({
      title: frontmatter.title,
      description: frontmatter.description ?? "",
      path: PATH,
      ogType: "article",
    }),
  component: OpenseoVsDataforseoPage,
});

function OpenseoVsDataforseoPage() {
  return (
    <article className="mx-auto max-w-3xl text-neutral-900">
      <header className="mb-10 border-b border-[var(--color-border-subtle)] pb-8">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          OpenSEO and DataForSEO
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

      <DocsBody className="min-w-0 text-neutral-800 [&_a:not(.not-prose_a)]:!text-neutral-950 [&_h2]:!text-neutral-950 [&_h2_a]:!no-underline [&_h3]:!text-neutral-950 [&_h3_a]:!no-underline [&_li]:!text-neutral-700 [&_li_a]:font-medium [&_li_a]:underline [&_li_a]:decoration-[var(--color-brand-accent)] [&_li_a]:underline-offset-4 [&_p]:!text-neutral-700 [&_p_a]:font-medium [&_p_a]:underline [&_p_a]:decoration-[var(--color-brand-accent)] [&_p_a]:underline-offset-4 [&_strong]:!text-neutral-950">
        <OpenseoVsDataforseoContent components={defaultMdxComponents} />
      </DocsBody>

      <section className="mt-14 rounded-xl border border-[var(--color-border-subtle)] bg-white p-6">
        <p className="text-xl font-semibold tracking-tight text-neutral-950">
          Try OpenSEO with your AI agent
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Start with free trial credits, connect Search Console, and point your
          agent at the same DataForSEO data, ready to use. No credit card
          needed.
        </p>
        <div className="not-prose mt-6">
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
