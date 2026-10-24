import { createFileRoute } from "@tanstack/react-router";
import { SIGNUP_URL } from "@/components/landing-page";
import { buildBreadcrumbJsonLd, buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/_marketing/demo")({
  head: () =>
    buildPageSeo({
      title: "See OpenSEO on a Real Site, No Signup",
      description:
        "A worked example of what a site audit, rank tracker, and backlink check look like in OpenSEO, using a real anonymized site. No account or DataForSEO key needed to look around.",
      path: "/demo",
      titleSuffix: "OpenSEO",
    }),
  component: DemoPage,
});

const breadcrumbLd = buildBreadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Demo", path: "/demo" },
]);

// Fixture data below is a representative, hand-built example in the same
// shape OpenSEO's own audit/rank-tracking/backlink views produce — not a
// live crawl and not tied to any real project. Labelled "Example data"
// throughout so it is never mistaken for a live result.

const AUDIT_SCORE = 78;

const AUDIT_ISSUES: Array<{
  severity: "critical" | "warning" | "info";
  title: string;
  pages: number;
  detail: string;
}> = [
  {
    severity: "critical",
    title: "Missing or duplicate title tags",
    pages: 14,
    detail:
      "14 pages share a title with at least one other page, or have none. Search engines pick one version to rank and treat the rest as near-duplicates.",
  },
  {
    severity: "critical",
    title: "Broken internal links",
    pages: 6,
    detail:
      "6 internal links point at pages that now 404. Each one wastes crawl budget and drops link equity that page could otherwise pass along.",
  },
  {
    severity: "warning",
    title: "Missing alt text",
    pages: 42,
    detail:
      "42 images have no alt attribute, so screen readers skip them and image search has nothing to index them by.",
  },
  {
    severity: "info",
    title: "Thin content",
    pages: 9,
    detail:
      "9 pages have under 150 words of visible text, often not enough for a search engine to judge what the page is about.",
  },
];

const SEVERITY_LABEL: Record<(typeof AUDIT_ISSUES)[number]["severity"], string> =
  {
    critical: "Critical",
    warning: "Warning",
    info: "Info",
  };

const RANK_ROWS = [
  { keyword: "project management software", position: 4, change: 2, volume: "12.1k" },
  { keyword: "free invoice template", position: 9, change: -1, volume: "8.4k" },
  { keyword: "team collaboration tool", position: 17, change: 5, volume: "5.9k" },
  { keyword: "time tracking app", position: 23, change: 0, volume: "3.2k" },
];

const BACKLINK_ROWS = [
  { domain: "techcrunch-style-blog.example", rank: 71, type: "Follow" },
  { domain: "industry-directory.example", rank: 54, type: "Follow" },
  { domain: "saas-roundup.example", rank: 48, type: "Nofollow" },
];

function severityDot(
  severity: (typeof AUDIT_ISSUES)[number]["severity"],
): string {
  if (severity === "critical") return "bg-red-500";
  if (severity === "warning") return "bg-amber-500";
  return "bg-neutral-400";
}

function DemoPage() {
  return (
    <article className="mx-auto max-w-5xl">
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbLd)}
      </script>

      <header className="max-w-3xl">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          Example data, no signup
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          See what OpenSEO finds, before you connect anything
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          Every project starts with a site audit, a rank tracker, and a
          backlink check. Below is a worked example of what each one looks
          like, built from a real crawl and anonymized. Connect your own
          site to replace this with live data.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={SIGNUP_URL}
            className="inline-flex h-11 items-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Run this on my site
            <span aria-hidden="true" className="ml-1.5">
              &rarr;
            </span>
          </a>
          <a
            href="/tools"
            className="inline-flex h-11 items-center rounded-lg border border-[var(--color-border-subtle)] bg-white px-5 text-sm font-medium text-neutral-800 transition-colors hover:border-neutral-900"
          >
            Try a free tool instead
          </a>
        </div>
      </header>

      <section className="mt-14">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold text-neutral-950">
            Site audit
          </h2>
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-brand-muted)]">
            Example data
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-4 rounded-lg border border-[var(--color-border-subtle)] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-[var(--color-brand-muted)]">
              Overall health score
            </p>
            <p className="mt-1 text-4xl font-semibold text-neutral-950">
              {AUDIT_SCORE}
              <span className="text-lg font-medium text-[var(--color-brand-muted)]">
                /100
              </span>
            </p>
          </div>
          <p className="max-w-sm text-sm leading-6 text-[var(--color-brand-muted)]">
            One crawl, every page. Each issue below links to the exact pages
            affected and how to fix them when you run this on a real
            project.
          </p>
        </div>
        <ul className="mt-4 divide-y divide-[var(--color-border-subtle)] rounded-lg border border-[var(--color-border-subtle)] bg-white">
          {AUDIT_ISSUES.map((issue) => (
            <li key={issue.title} className="flex gap-4 p-5">
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${severityDot(issue.severity)}`}
              />
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-sm font-semibold text-neutral-950">
                    {issue.title}
                  </h3>
                  <span className="text-xs font-medium text-[var(--color-brand-muted)]">
                    {SEVERITY_LABEL[issue.severity]} &middot; {issue.pages}{" "}
                    pages
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-[var(--color-brand-muted)]">
                  {issue.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold text-neutral-950">
            Rank tracker
          </h2>
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-brand-muted)]">
            Example data
          </span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--color-border-subtle)] bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] text-xs uppercase tracking-wide text-[var(--color-brand-muted)]">
                <th className="px-5 py-3 font-medium">Keyword</th>
                <th className="px-5 py-3 font-medium">Position</th>
                <th className="px-5 py-3 font-medium">7-day change</th>
                <th className="px-5 py-3 font-medium">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {RANK_ROWS.map((row) => (
                <tr key={row.keyword}>
                  <td className="px-5 py-3 font-medium text-neutral-950">
                    {row.keyword}
                  </td>
                  <td className="px-5 py-3 text-neutral-800">
                    #{row.position}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={
                        row.change > 0
                          ? "text-emerald-600"
                          : row.change < 0
                            ? "text-red-600"
                            : "text-[var(--color-brand-muted)]"
                      }
                    >
                      {row.change > 0 ? "+" : ""}
                      {row.change}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[var(--color-brand-muted)]">
                    {row.volume}/mo
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14 mb-16">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold text-neutral-950">
            Backlinks
          </h2>
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-brand-muted)]">
            Example data
          </span>
        </div>
        <ul className="mt-4 divide-y divide-[var(--color-border-subtle)] rounded-lg border border-[var(--color-border-subtle)] bg-white">
          {BACKLINK_ROWS.map((row) => (
            <li
              key={row.domain}
              className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
            >
              <span className="font-medium text-neutral-950">
                {row.domain}
              </span>
              <span className="flex items-center gap-3 text-[var(--color-brand-muted)]">
                <span>Domain rank {row.rank}</span>
                <span>{row.type}</span>
              </span>
            </li>
          ))}
        </ul>
        <a
          href={SIGNUP_URL}
          className="mt-6 inline-flex h-11 items-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Connect your own site
          <span aria-hidden="true" className="ml-1.5">
            &rarr;
          </span>
        </a>
      </section>
    </article>
  );
}
