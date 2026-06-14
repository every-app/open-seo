import type { FeaturePage } from "@/lib/feature-pages";

type FeaturePageProps = {
  page: FeaturePage;
};

export function FeaturePageTemplate({ page }: FeaturePageProps) {
  return (
    <article className="mx-auto max-w-5xl">
      <header className="max-w-3xl">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          {page.eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          {page.title}
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          {page.description}
        </p>
        <div className="mt-5">
          <a
            href="https://app.openseo.so/sign-up"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Try OpenSEO
            <span aria-hidden="true" className="ml-2">
              &rarr;
            </span>
          </a>
        </div>
      </header>

      <FeatureImage page={page} />

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          What you can do
        </h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {page.workflows.map((workflow, index) => (
            <li
              key={workflow.title}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-5"
            >
              <span className="font-mono text-sm tabular-nums text-[var(--color-brand-accent)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 text-base font-semibold text-neutral-950">
                {workflow.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
                {workflow.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {page.showMetrics ? <MetricsSection page={page} /> : null}

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        <ListSection title="Use cases" items={page.useCases} />
        <ListSection title="Why OpenSEO" items={page.differentiators} />
      </div>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Related features
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {page.related.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-4 text-sm font-medium text-neutral-950 transition-colors hover:border-neutral-900"
            >
              {item.label}
              <span
                aria-hidden="true"
                className="ml-1 text-[var(--color-brand-accent)]"
              >
                &rarr;
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          FAQ
        </h2>
        <div className="mt-5 divide-y divide-[var(--color-border-subtle)] rounded-lg border border-[var(--color-border-subtle)] bg-white">
          {page.faqs.map((faq) => (
            <div key={faq.question} className="p-5">
              <h3 className="text-sm font-semibold text-neutral-900">
                {faq.question}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-xl border border-[var(--color-border-subtle)] bg-white p-6 md:p-8">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Try OpenSEO
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          The open source alternative to bloated, expensive, legacy SEO tools.
        </p>
        <div className="mt-4">
          <a
            href="https://app.openseo.so/sign-up"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Try OpenSEO
            <span aria-hidden="true" className="ml-2">
              &rarr;
            </span>
          </a>
        </div>
      </section>
    </article>
  );
}

function FeatureImage({ page }: FeaturePageProps) {
  return (
    <figure className="mt-10 rounded-xl border border-[var(--color-border-subtle)] bg-white p-3">
      <img
        src={page.imageSrc}
        alt={page.imageAlt}
        width={1600}
        height={1000}
        loading="eager"
        decoding="async"
        className="aspect-[16/10] w-full rounded-lg border border-[#ebe4da] object-cover object-top"
      />
      <figcaption className="px-1 pt-2 text-[11px] text-[var(--color-brand-muted)]">
        {page.eyebrow} in OpenSEO.
      </figcaption>
    </figure>
  );
}

function MetricsSection({ page }: FeaturePageProps) {
  return (
    <section className="mt-12">
      <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
        Data you can act on
      </h2>
      <dl className="mt-5 grid overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-white sm:grid-cols-2 md:grid-cols-4">
        {page.metrics.map((metric, index) => (
          <div
            key={metric.label}
            className={[
              "p-5",
              index > 0 && "border-t border-[var(--color-border-subtle)]",
              index % 2 === 1 &&
                "sm:border-l sm:border-[var(--color-border-subtle)]",
              index > 1 && "sm:border-t",
              index > 0 &&
                "md:border-l md:border-t-0 md:border-[var(--color-border-subtle)]",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <dt className="text-xs text-[var(--color-brand-muted)]">
              {metric.label}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-neutral-950">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-5">
      <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
        {title}
      </h2>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm text-neutral-700">
            <span
              aria-hidden="true"
              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-accent)]"
            />
            <span className="leading-6">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
