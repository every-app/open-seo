import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { getAiDiscoverability } from "@/serverFunctions/aiDiscoverability";
import { getProjects } from "@/serverFunctions/projects";

const searchSchema = z.object({ url: z.string().optional() });

export const Route = createFileRoute(
  "/_project/p/$projectId/ai-discoverability",
)({
  validateSearch: searchSchema,
  component: AiDiscoverabilityPage,
});

function AiDiscoverabilityPage() {
  const { projectId } = Route.useParams();
  const { url: searchedUrl } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const project = projectsQuery.data?.find((entry) => entry.id === projectId);
  const activeUrl = searchedUrl ?? project?.domain ?? "";
  const [draftUrl, setDraftUrl] = useState(activeUrl);

  useEffect(() => setDraftUrl(activeUrl), [activeUrl]);

  const checkQuery = useQuery({
    queryKey: ["ai-discoverability", projectId, activeUrl],
    queryFn: () =>
      getAiDiscoverability({ data: { projectId, url: activeUrl } }),
    enabled: activeUrl.length > 0,
    staleTime: 15 * 60 * 1000,
    retry: false,
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void navigate({ search: { url: draftUrl.trim() } });
  };

  const result = checkQuery.data;
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-24 md:px-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Discoverability</h1>
        <p className="mt-1 text-sm text-base-content/70">
          Check whether a page is open to search and AI crawlers. This is a
          technical readiness check, not a count of mentions in AI answers.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
        <input
          className="input input-bordered min-w-64 flex-1"
          type="text"
          value={draftUrl}
          onChange={(event) => setDraftUrl(event.target.value)}
          placeholder="https://example.com/"
          aria-label="Page URL"
          required
        />
        <button className="btn btn-primary" type="submit">
          Check page
        </button>
      </form>

      {checkQuery.isPending && activeUrl ? (
        <p className="text-sm text-base-content/70">Checking the page…</p>
      ) : null}
      {checkQuery.isError ? (
        <div role="alert" className="alert alert-error">
          Could not check this URL. Enter a public HTTP or HTTPS page and try
          again.
        </div>
      ) : null}

      {result ? (
        <>
          <div className="text-xs text-base-content/60">
            Checked {new Date(result.checkedAt).toLocaleString()} · {result.url}
          </div>

          <section className="rounded-xl border border-base-300 bg-base-100 p-5">
            <h2 className="text-lg font-semibold">Crawler access</h2>
            <p className="mt-1 text-sm text-base-content/70">
              robots.txt: {result.robots.status ?? "unreachable"}. An allowed
              rule only describes the site’s published policy; a firewall can
              still block the crawler.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {result.robots.crawlers.map((crawler) => (
                <div
                  key={crawler.userAgent}
                  className="flex items-center justify-between gap-3 rounded-lg border border-base-300 px-3 py-2 text-sm"
                >
                  <span>{crawler.name}</span>
                  <span
                    className={`badge ${crawler.allowed === true ? "badge-success" : crawler.allowed === false ? "badge-error" : "badge-ghost"}`}
                  >
                    {crawler.allowed === true
                      ? "Allowed"
                      : crawler.allowed === false
                        ? "Blocked"
                        : "Unknown"}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-base-content/70">
              Sitemap references in robots.txt: {result.robots.sitemaps.length}.
            </p>
          </section>

          <section className="rounded-xl border border-base-300 bg-base-100 p-5">
            <h2 className="text-lg font-semibold">What this server received</h2>
            <p className="mt-1 text-sm text-base-content/70">
              HTTP {result.page.status ?? "unreachable"}
              {result.page.challenge
                ? ` · Hosting challenge: ${result.page.challenge}`
                : ""}
            </p>
            {result.page.error ? (
              <p className="mt-2 text-sm text-warning">{result.page.error}</p>
            ) : null}
            {result.page.status === 403 ? (
              <p className="mt-2 text-sm text-warning">
                The hosting firewall blocked this server’s request. Check its
                logs and allow trusted crawlers only where appropriate.
              </p>
            ) : null}
            {result.page.title !== null ? (
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-base-content/60">Title</dt>
                  <dd>{result.page.title || "Missing"}</dd>
                </div>
                <div>
                  <dt className="text-base-content/60">Main heading</dt>
                  <dd>{result.page.h1s[0] || "Missing"}</dd>
                </div>
                <div>
                  <dt className="text-base-content/60">Visible words</dt>
                  <dd>{result.page.wordCount}</dd>
                </div>
                <div>
                  <dt className="text-base-content/60">Search preview</dt>
                  <dd>
                    {result.page.noindex
                      ? "Noindex"
                      : result.page.nosnippet
                        ? "Nosnippet"
                        : "No blocking directive detected"}
                  </dd>
                </div>
              </dl>
            ) : null}
          </section>

          <p className="text-sm text-base-content/70">
            Google says AI Overviews and AI Mode follow ordinary Search
            eligibility. For actual citations, compare measured platform data
            such as Bing Webmaster Tools’ AI Performance report or labeled
            prompt samples. A single model answer is not a platform-wide
            ranking.
          </p>
        </>
      ) : null}
    </div>
  );
}
