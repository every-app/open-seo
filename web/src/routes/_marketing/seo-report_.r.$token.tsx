import { createFileRoute } from "@tanstack/react-router";
import { DocsBody } from "fumadocs-ui/page";
import { ReportMarkdown } from "@/components/report-markdown";
import { signupUrl } from "@/lib/seo-report/links";
import { getSeoReport } from "@/lib/seo-report/report.functions";

// A written report, reached only by the link in its email.

export const Route = createFileRoute("/_marketing/seo-report_/r/$token")({
  loader: ({ params }) => getSeoReport({ data: params.token }),
  headers: () => ({ "X-Robots-Tag": "noindex, nofollow" }),
  // A link with no report behind it gets no title of its own.
  head: ({ loaderData }) => ({
    meta: [
      ...(loaderData ? [{ title: `${loaderData.title} - OpenSEO` }] : []),
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const report = Route.useLoaderData();
  const written = new Date(report.writtenAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <article className="mx-auto w-full min-w-0 max-w-3xl text-neutral-950">
      <header className="mb-10 border-b border-[var(--color-border-subtle)] pb-8">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          SEO report by OpenSEO
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          {report.title}
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          {report.headline}
        </p>
        {report.stats.length > 0 ? (
          <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
            {report.stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-4"
              >
                <dt className="text-xs text-[var(--color-brand-muted)]">
                  {stat.label}
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="mt-6 text-sm leading-6 text-[var(--color-brand-muted)]">
          Written automatically on {written} from {report.site}&apos;s public
          pages and search data. Nobody at OpenSEO has read it. Every number is
          an estimate.
        </p>
      </header>

      {report.takeaways.length > 0 ? (
        <ul className="mb-10 list-disc space-y-2 pl-5 text-neutral-800">
          {report.takeaways.map((takeaway) => (
            <li key={takeaway}>{takeaway}</li>
          ))}
        </ul>
      ) : null}

      {/* The report's own H1 repeats the page title above. */}
      <DocsBody className="min-w-0 break-words text-neutral-800 [&_a]:!text-neutral-950 [&_a]:underline [&_a]:decoration-[var(--color-brand-accent)] [&_a]:underline-offset-4 [&_h1]:hidden [&_h2]:text-neutral-950 [&_h3]:text-neutral-950 [&_li]:text-neutral-700 [&_p]:text-neutral-700 [&_strong]:text-neutral-950">
        <ReportMarkdown
          markdown={report.markdown}
          site={report.site}
          hosts={report.hosts}
        />
      </DocsBody>

      <section className="mt-12 rounded-xl border border-[var(--color-border-subtle)] bg-white p-6 md:p-8">
        <h2 className="text-2xl font-semibold tracking-tight">
          Track these keywords in OpenSEO
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Create an account and {report.site} is already filled in. Start with
          free trial credits.
        </p>
        <a
          href={signupUrl(report.site, "report-page")}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Create an account
          <span aria-hidden="true" className="ml-2">
            &rarr;
          </span>
        </a>
      </section>
    </article>
  );
}
