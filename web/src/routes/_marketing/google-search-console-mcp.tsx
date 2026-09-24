import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody } from "fumadocs-ui/page";
import GoogleSearchConsoleMcpContent, {
  frontmatter,
} from "../../../content/marketing/google-search-console-mcp.mdx";
import { ComparisonTable } from "@/components/comparison-table";
import { buildPageSeo, SITE_URL, toCanonicalUrl } from "@/lib/seo";
import { appLinks, brand } from "@/lib/brand";

const PATH = "/google-search-console-mcp";

const softwareApplicationLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: `${brand.name} Google Search Console MCP`,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: toCanonicalUrl(PATH),
  description: frontmatter.description,
  provider: {
    "@type": "Organization",
    name: `${brand.name}`,
    url: SITE_URL,
  },
};

export const Route = createFileRoute("/_marketing/google-search-console-mcp")({
  head: () =>
    buildPageSeo({
      title: "Google Search Console MCP Server: No Google Cloud Setup",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: brand.name,
      ogType: "article",
    }),
  component: GoogleSearchConsoleMcpPage,
});

function GoogleSearchConsoleMcpPage() {
  return (
    <article className="mx-auto max-w-4xl text-neutral-900">
      <header className="mb-10 border-b border-[var(--color-border-subtle)] pb-8">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          Search Console MCP
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          {frontmatter.title}
        </h1>
        {frontmatter.description ? (
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--color-brand-muted)]">
            {frontmatter.description}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href={appLinks.signUp}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Get started
            <span className="ml-2" aria-hidden="true">
              &rarr;
            </span>
          </a>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Search Console tools never use credits.
        </p>
      </header>

      <DocsBody className="min-w-0 text-neutral-800 [&_a]:!text-neutral-950 [&_h2]:!text-neutral-950 [&_h2_a]:!no-underline [&_h3]:!text-neutral-950 [&_h3_a]:!no-underline [&_h4]:!text-neutral-950 [&_h4_a]:!no-underline [&_h5_a]:!no-underline [&_h6_a]:!no-underline [&_li]:!text-neutral-700 [&_li_a]:font-medium [&_li_a]:underline [&_li_a]:decoration-[var(--color-brand-accent)] [&_li_a]:underline-offset-4 [&_li_a:hover]:!text-neutral-700 [&_p]:!text-neutral-700 [&_p_a]:font-medium [&_p_a]:underline [&_p_a]:decoration-[var(--color-brand-accent)] [&_p_a]:underline-offset-4 [&_p_a:hover]:!text-neutral-700 [&_strong]:!text-neutral-950">
        <GoogleSearchConsoleMcpContent
          components={{ ...defaultMdxComponents, ComparisonTable }}
        />
      </DocsBody>

      <GoogleSearchConsoleMcpCta />

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationLd),
        }}
      />
    </article>
  );
}

function GoogleSearchConsoleMcpCta() {
  return (
    <section className="mt-14 rounded-xl border border-[var(--color-border-subtle)] bg-white p-6">
      <p className="text-xl font-semibold tracking-tight text-neutral-950">
        Point your AI at your real search data
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
        No Google Cloud project. Zero credits to read your own data. Works with
        Claude, Codex, OpenClaw, OpenCode, and Gemini.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <a
          href={appLinks.signUp}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Get started
          <span className="ml-2" aria-hidden="true">
            &rarr;
          </span>
        </a>
        <a
          href="/docs/mcp"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--color-border-subtle)] bg-white px-4 text-sm font-medium text-neutral-950 transition-colors hover:border-neutral-950"
        >
          Read the MCP docs
        </a>
      </div>
    </section>
  );
}
