import { type FormEvent, useEffect, useRef, useState } from "react";

// Public site key. Cloudflare's always-passing test key is the dev-only
// fallback; a prod build without VITE_TURNSTILE_SITE_KEY renders no widget.
const TURNSTILE_SITE_KEY =
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ||
  (import.meta.env.DEV ? "1x00000000000000000000AA" : "");

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      appearance?: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
    },
  ): string;
  reset(widgetId?: string): void;
};

type BacklinkRow = {
  domainFrom: string | null;
  urlFrom: string | null;
  urlTo: string | null;
  pageTitle: string | null;
  anchor: string | null;
  dofollow: boolean | null;
  domainRank: number | null;
};

type CheckResult = {
  target: string;
  summary: {
    rank: number | null;
    backlinks: number | null;
    referringDomains: number | null;
    brokenBacklinks: number | null;
  };
  topBacklinks: BacklinkRow[];
};

function formatCount(value: number | null): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : "—";
}

/** Small info icon that reveals an explanation on hover or focus. */
function InfoTip({
  tip,
  align = "center",
}: {
  tip: string;
  align?: "center" | "right";
}) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={tip}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 focus:text-neutral-700 focus:outline-none"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="h-3.5 w-3.5"
        >
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" />
          <path
            d="M8 7.25v3.25M8 5.25v.1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <span
        role="tooltip"
        aria-hidden="true"
        className={[
          "pointer-events-none absolute top-full z-10 mt-1.5 w-56 rounded-lg bg-neutral-950 px-3 py-2 text-left text-xs font-normal normal-case leading-5 text-white opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
          align === "right" ? "right-0" : "left-1/2 -translate-x-1/2",
        ].join(" ")}
      >
        {tip}
      </span>
    </span>
  );
}

export function BacklinkCheckerTool() {
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);

  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef("");

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    const w = window as unknown as {
      turnstile?: TurnstileApi;
      onloadTurnstileCallback?: () => void;
    };
    const renderWidget = () => {
      if (!w.turnstile || !widgetContainerRef.current) return;
      if (widgetIdRef.current !== null) return;
      widgetIdRef.current = w.turnstile.render(widgetContainerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        // Invisible unless Turnstile decides the visitor needs a challenge.
        appearance: "interaction-only",
        callback: (token) => {
          tokenRef.current = token;
        },
        "expired-callback": () => {
          tokenRef.current = "";
        },
      });
    };

    if (w.turnstile) {
      renderWidget();
      return;
    }
    w.onloadTurnstileCallback = renderWidget;
    if (!document.querySelector("script[data-turnstile]")) {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback";
      script.async = true;
      script.dataset.turnstile = "true";
      document.head.appendChild(script);
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");
    try {
      const res = await fetch("/api/backlink-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          turnstileToken: tokenRef.current || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | CheckResult
        | { error?: string };
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || "Something went wrong",
        );
      }
      setResult(data as CheckResult);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      // Tokens are single-use; get a fresh one for the next check.
      tokenRef.current = "";
      const w = window as unknown as { turnstile?: TurnstileApi };
      if (w.turnstile && widgetIdRef.current !== null) {
        w.turnstile.reset(widgetIdRef.current);
      }
    }
  };

  return (
    <div>
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-[var(--color-border-subtle)] bg-white p-4 md:p-5"
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="backlink-target" className="sr-only">
            Domain to check
          </label>
          <input
            id="backlink-target"
            name="target"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="example.com"
            disabled={status === "loading"}
            className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--color-border-subtle)] bg-white px-3.5 text-base text-neutral-900 placeholder:text-neutral-500 transition focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="h-11 shrink-0 rounded-lg bg-neutral-950 px-6 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          >
            {status === "loading" ? "Checking…" : "Check backlinks"}
          </button>
        </div>
        <div ref={widgetContainerRef} className="empty:hidden" />
        <p className="mt-2.5 text-xs text-[var(--color-brand-muted)]">
          Free &middot; No signup &middot; Instant results
        </p>
        {status === "error" && (
          <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
        )}
      </form>

      {status === "done" && result ? <CheckResults result={result} /> : null}
    </div>
  );
}

function CheckResults({ result }: { result: CheckResult }) {
  const { summary, topBacklinks } = result;
  const total = summary.backlinks;
  const hasMore = typeof total === "number" && total > topBacklinks.length;

  const metrics = [
    {
      label: "Domain rank",
      value: formatCount(summary.rank),
      tip: "DataForSEO's 0-100 strength score for a domain's link profile. Similar idea to Ahrefs DR or Moz DA, but each tool uses its own index and formula, so numbers differ between tools.",
    },
    {
      label: "Backlinks",
      value: formatCount(summary.backlinks),
      tip: "Total individual links pointing at this domain, counting multiple links from the same website.",
    },
    {
      label: "Referring domains",
      value: formatCount(summary.referringDomains),
      tip: "Unique websites that link to this domain at least once.",
    },
    {
      label: "Broken backlinks",
      value: formatCount(summary.brokenBacklinks),
      tip: "Links pointing at pages on this domain that no longer load, such as deleted pages returning 404.",
    },
  ];

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold tracking-tight text-neutral-950">
        Backlink profile for{" "}
        <span className="text-[var(--color-brand-accent)]">
          {result.target}
        </span>
      </h2>

      <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-white md:grid-cols-4">
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            className={[
              "p-4 md:p-5",
              index % 2 === 1 && "border-l border-[var(--color-border-subtle)]",
              index > 1 && "border-t border-[var(--color-border-subtle)]",
              index > 0 && "md:border-l md:border-t-0",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <dt className="text-xs text-[var(--color-brand-muted)]">
              {metric.label}
              <InfoTip
                tip={metric.tip}
                align={index > 1 ? "right" : "center"}
              />
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-neutral-950">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>

      {topBacklinks.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--color-border-subtle)] bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] text-xs text-[var(--color-brand-muted)]">
                <th className="px-4 py-3 font-medium">
                  Rank
                  <InfoTip tip="Strength (0-100) of the linking website's own link profile. Links from higher-rank domains generally carry more weight." />
                </th>
                <th className="px-4 py-3 font-medium">Referring page</th>
                <th className="px-4 py-3 font-medium">
                  Anchor and target
                  <InfoTip tip="The clickable text of the link, and the page on this domain the link points to." />
                </th>
                <th className="px-4 py-3 font-medium">
                  Type
                  <InfoTip
                    tip="Follow links can pass ranking value to the target. Nofollow links ask search engines not to count them."
                    align="right"
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {topBacklinks.map((row) => (
                <tr key={row.urlFrom ?? row.domainFrom ?? ""}>
                  <td className="px-4 py-3 align-top tabular-nums text-neutral-950">
                    {formatCount(row.domainRank)}
                  </td>
                  <td className="max-w-[300px] px-4 py-3 align-top">
                    <p className="truncate font-medium text-neutral-950">
                      {row.pageTitle ?? row.domainFrom ?? "—"}
                    </p>
                    {row.urlFrom ? (
                      <a
                        href={row.urlFrom}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="block truncate text-xs text-[var(--color-brand-muted)] hover:text-neutral-900 hover:underline"
                      >
                        {row.urlFrom}
                      </a>
                    ) : null}
                  </td>
                  <td className="max-w-[260px] px-4 py-3 align-top">
                    <p className="truncate text-neutral-700">
                      {row.anchor ?? "—"}
                    </p>
                    {row.urlTo ? (
                      <p className="truncate text-xs text-[var(--color-brand-muted)]">
                        {row.urlTo}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={
                        row.dofollow
                          ? "rounded-full border border-[var(--color-border-subtle)] px-2 py-0.5 text-xs font-medium text-neutral-900"
                          : "rounded-full px-2 py-0.5 text-xs text-neutral-500"
                      }
                    >
                      {row.dofollow ? "Follow" : "Nofollow"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-[var(--color-border-subtle)] bg-white p-5 text-sm text-neutral-700">
          No live backlinks found for this domain in the index yet.
        </p>
      )}

      <div className="mt-4 rounded-xl border border-[var(--color-border-subtle)] bg-white p-5 md:p-6">
        <p className="text-sm leading-6 text-neutral-700">
          {hasMore ? (
            <>
              Showing the top {topBacklinks.length} backlinks, one per referring
              domain, strongest domains first.{" "}
              <span className="font-medium text-neutral-950">
                {formatCount(total)} total backlinks
              </span>{" "}
              are in the index for this domain.
            </>
          ) : (
            <>
              Explore the full picture: referring domains, anchors, new and lost
              links, and spam signals.
            </>
          )}
        </p>
        <div className="mt-3">
          <a
            href="https://app.openseo.so/sign-up"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Explore the full profile — free
            <span aria-hidden="true" className="ml-2">
              &rarr;
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
