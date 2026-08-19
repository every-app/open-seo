import type { ReactNode } from "react";
import { DocsBody } from "fumadocs-ui/page";
import { buildBreadcrumbJsonLd } from "@/lib/seo";

const KEYWORD_RESEARCH_LIBRARY = {
  name: "Keyword Research",
  path: "/library/keyword-research",
};

type LibraryRef = {
  name: string;
  path: string;
};

type LibrarySpokePageProps = {
  title: string;
  description?: string;
  crumb: string;
  path: string;
  library?: LibraryRef;
  children: ReactNode;
};

export function LibrarySpokePage({
  title,
  description,
  crumb,
  path,
  library = KEYWORD_RESEARCH_LIBRARY,
  children,
}: LibrarySpokePageProps) {
  const breadcrumbLd = buildBreadcrumbJsonLd([
    { name: "Strategy Library", path: "/library" },
    { name: library.name, path: library.path },
    { name: crumb, path },
  ]);

  return (
    <article className="mx-auto max-w-3xl text-neutral-900">
      <header className="mb-10 border-b border-[var(--color-border-subtle)] pb-8">
        <nav
          aria-label="Breadcrumb"
          className="text-sm text-[var(--color-brand-muted)]"
        >
          <a
            href="/library"
            className="font-medium text-[var(--color-brand-accent)]"
          >
            Strategy Library
          </a>{" "}
          /{" "}
          <a
            href={library.path}
            className="font-medium text-[var(--color-brand-accent)]"
          >
            {library.name}
          </a>{" "}
          / <span>{crumb}</span>
        </nav>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--color-brand-muted)]">
            {description}
          </p>
        ) : null}
      </header>

      <DocsBody className="min-w-0 text-neutral-800 [&_a]:!text-neutral-950 [&_h2]:!text-neutral-950 [&_h2_a]:!no-underline [&_h3]:!text-neutral-950 [&_h3_a]:!no-underline [&_li]:!text-neutral-700 [&_li_a]:font-medium [&_li_a]:underline [&_li_a]:decoration-[var(--color-brand-accent)] [&_li_a]:underline-offset-4 [&_li_a:hover]:!text-neutral-700 [&_p]:!text-neutral-700 [&_p_a]:font-medium [&_p_a]:underline [&_p_a]:decoration-[var(--color-brand-accent)] [&_p_a]:underline-offset-4 [&_p_a:hover]:!text-neutral-700 [&_strong]:!text-neutral-950">
        {children}
      </DocsBody>

      <LibrarySpokeCta library={library} />

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
    </article>
  );
}

function LibrarySpokeCta({ library }: { library: LibraryRef }) {
  return (
    <section className="mt-14 rounded-xl border border-[var(--color-border-subtle)] bg-white p-6">
      <p className="text-xl font-semibold tracking-tight text-neutral-950">
        Run this strategy in OpenSEO
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
        Run the MCP prompt in this guide with OpenSEO. OpenSEO is open source,
        free to try, and does not require a credit card.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <a
          href="https://app.openseo.so/sign-up"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Start with OpenSEO
          <span className="ml-2" aria-hidden="true">
            &rarr;
          </span>
        </a>
        <a
          href={library.path}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-border-subtle)] bg-white px-4 text-sm font-medium text-neutral-950 transition-colors hover:border-neutral-950"
        >
          Back to {library.name}
        </a>
      </div>
    </section>
  );
}
