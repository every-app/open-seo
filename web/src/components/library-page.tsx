import type { ReactNode } from "react";
import { DocsBody } from "fumadocs-ui/page";

const LIBRARY_PILLAR_PATH = "/library/keyword-research";

type LibrarySpokePageProps = {
  title: string;
  description?: string;
  crumb: string;
  children: ReactNode;
};

export function LibrarySpokePage({
  title,
  description,
  crumb,
  children,
}: LibrarySpokePageProps) {
  return (
    <article className="mx-auto max-w-3xl text-neutral-900">
      <header className="mb-10 border-b border-[var(--color-border-subtle)] pb-8">
        <p className="text-sm text-[var(--color-brand-muted)]">
          <a
            href={LIBRARY_PILLAR_PATH}
            className="font-medium text-[var(--color-brand-accent)]"
          >
            Strategy Library
          </a>{" "}
          / <span>{crumb}</span>
        </p>
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

      <LibrarySpokeCta />
    </article>
  );
}

function LibrarySpokeCta() {
  return (
    <section className="mt-14 rounded-xl border border-[var(--color-border-subtle)] bg-white p-6">
      <p className="text-xl font-semibold tracking-tight text-neutral-950">
        Run every play in this guide
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
        OpenSEO connects your Search Console and expands your seeds. Open
        source, free to try, no credit card.
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
          href={LIBRARY_PILLAR_PATH}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-border-subtle)] bg-white px-4 text-sm font-medium text-neutral-950 transition-colors hover:border-neutral-950"
        >
          Back to the Strategy Library
        </a>
      </div>
    </section>
  );
}
