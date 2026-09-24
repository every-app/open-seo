import { createFileRoute } from "@tanstack/react-router";
import { freeToolList } from "@/lib/free-tools/tool-pages";
import { buildBreadcrumbJsonLd, buildPageSeo } from "@/lib/seo";
import { appLinks, brand } from "@/lib/brand";

export const Route = createFileRoute("/_marketing/tools")({
  head: () =>
    buildPageSeo({
      title: "Free SEO Tools",
      description:
        `Find competitor keywords, generate keyword ideas, and check backlinks, traffic, spam score, and domain age with ${brand.name}’s free SEO tools. No signup.`,
      path: "/tools",
      titleSuffix: brand.name,
      imageAlt: `${brand.name} free SEO tools`,
    }),
  component: ToolsPage,
});

const breadcrumbLd = buildBreadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Free tools", path: "/tools" },
]);

function ToolsPage() {
  return (
    <article className="mx-auto max-w-5xl">
      <header className="max-w-3xl">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          Free tools
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          Free SEO Tools
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          Check backlinks, rankings, traffic, and domain details, or preview a
          search result. Use these tools without an account.
        </p>
      </header>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {freeToolList.map((tool) => (
          <a
            key={tool.slug}
            href={tool.path}
            className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-5 transition-colors hover:border-neutral-900"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-neutral-950">
                {tool.name}
                <span
                  aria-hidden="true"
                  className="ml-1 text-[var(--color-brand-accent)]"
                >
                  &rarr;
                </span>
              </h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
              {tool.shortDescription}
            </p>
          </a>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-neutral-950">
          Connect your Search Console data
        </h2>
        <a
          href="/google-search-console-mcp"
          className="mt-4 block rounded-lg border border-[var(--color-border-subtle)] bg-white p-5 transition-colors hover:border-neutral-900"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold text-neutral-950">
              Google Search Console MCP
              <span
                aria-hidden="true"
                className="ml-1 text-[var(--color-brand-accent)]"
              >
                &rarr;
              </span>
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
            Point Claude, Codex, or any MCP client at your own Search Console
            data. Connect your Google account to get started; no Google Cloud
            project is needed.
          </p>
        </a>
      </section>

      <section className="mt-12 rounded-xl border border-[var(--color-border-subtle)] bg-white p-6 md:p-8">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Why these are free
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          These tools give you a useful first look at a website without an
          account. Data lookups have usage limits to keep them free. For more
          research, {brand.name} brings keyword research, rank tracking, backlinks,
          and site audits into one workspace, with trial credits to get started.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <a
            href={appLinks.signUp}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Try {brand.name}
            <span aria-hidden="true" className="ml-2">
              &rarr;
            </span>
          </a>
          <a
            href="/features"
            className="text-sm font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            See all features
            <span aria-hidden="true" className="ml-1">
              &rarr;
            </span>
          </a>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
    </article>
  );
}
