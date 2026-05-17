import type { FeaturePage } from "@/lib/feature-pages";

type FeaturePageProps = {
  page: FeaturePage;
};

export function FeaturePageTemplate({ page }: FeaturePageProps) {
  return (
    <article>
      <header>
        <p className="text-sm font-medium text-neutral-500">{page.eyebrow}</p>
        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight">
          {page.title}
        </h1>
        <p className="mt-4 text-neutral-700 leading-relaxed">
          {page.description}
        </p>
        <div className="mt-5">
          <a
            href="https://app.openseo.so/sign-up"
            className="inline-flex h-10 items-center justify-center rounded-md bg-neutral-900 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            {page.ctaLabel ?? "Try OpenSEO"}
          </a>
        </div>
      </header>

      <FeatureImage page={page} />

      <section className="mt-12">
        <h2 className="text-xl font-semibold">What you can do</h2>
        <ol className="mt-6 space-y-6">
          {page.workflows.map((workflow, index) => (
            <li
              key={workflow.title}
              className="grid grid-cols-[2.25rem_1fr] gap-x-4"
            >
              <span className="pt-[2px] font-mono text-sm tabular-nums text-neutral-400">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">
                  {workflow.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                  {workflow.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Data you can act on</h2>
        <dl className="mt-5 grid grid-cols-2 border-y border-neutral-200 md:grid-cols-4 md:divide-x md:divide-neutral-200">
          {page.metrics.map((metric, index) => (
            <div
              key={metric.label}
              className={[
                "px-4 py-3",
                index % 2 === 1 && "border-l border-neutral-200 md:border-l-0",
                index < 2 && "border-b border-neutral-200 md:border-b-0",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <dt className="text-xs text-neutral-500">{metric.label}</dt>
              <dd className="mt-1 text-sm font-semibold text-neutral-900">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Use cases</h2>
        <ul className="mt-4 space-y-3">
          {page.useCases.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm text-neutral-700">
              <span className="mt-[2px] text-neutral-400">&mdash;</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Why OpenSEO</h2>
        <ul className="mt-4 space-y-3">
          {page.differentiators.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm text-neutral-700">
              <span className="mt-[2px] text-neutral-400">&mdash;</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Related features</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {page.related.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg border border-neutral-200 bg-white p-4 text-sm font-medium text-neutral-900 transition-colors hover:border-neutral-900"
            >
              {item.label}
              <span aria-hidden="true" className="ml-1 text-neutral-500">
                &rarr;
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">FAQ</h2>
        <div className="mt-5 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {page.faqs.map((faq) => (
            <div key={faq.question} className="p-4">
              <h3 className="text-sm font-semibold text-neutral-900">
                {faq.question}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-lg border border-neutral-200 bg-neutral-50 p-5">
        <h2 className="text-lg font-semibold text-neutral-900">
          Try OpenSEO
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          The open source alternative to bloated, expensive, legacy SEO tools.
        </p>
        <div className="mt-4">
          <a
            href="https://app.openseo.so/sign-up"
            className="inline-flex h-9 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            {page.ctaLabel ?? "Try OpenSEO"}
          </a>
        </div>
      </section>
    </article>
  );
}

function FeatureImage({ page }: FeaturePageProps) {
  if (page.imageSrc) {
    return (
      <figure className="mt-9">
        <img
          src={page.imageSrc}
          alt={page.imageAlt}
          width={1600}
          height={1000}
          loading="eager"
          decoding="async"
          className="aspect-[16/10] w-full rounded-lg border border-neutral-200 object-cover object-top"
        />
        <figcaption className="mt-2 text-[11px] text-neutral-500">
          {page.eyebrow} in OpenSEO.
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="mt-9">
      <div
        role="img"
        aria-label={page.imageAlt}
        className="flex aspect-[16/10] w-full items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-6 text-center"
      >
        <div>
          <p className="text-sm font-medium text-neutral-900">
            {page.imagePlaceholder}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Replace with final product screenshot or short demo asset.
          </p>
        </div>
      </div>
      <figcaption className="mt-2 text-[11px] text-neutral-500">
        Placeholder for final OpenSEO product imagery.
      </figcaption>
    </figure>
  );
}
