import {
  Activity,
  Eye,
  Flame,
  MousePointerClick,
  ScrollText,
} from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_project/p/$projectId/clarity")({
  component: ClarityRoute,
});

const modules = [
  {
    title: "Click heatmap",
    detail:
      "See the elements visitors click most and identify ignored calls to action.",
    icon: MousePointerClick,
  },
  {
    title: "Rage clicks",
    detail:
      "Highlight repeated clicks that may indicate a broken control or confusing UI.",
    icon: Flame,
  },
  {
    title: "Scroll depth",
    detail: "Measure how far visitors reach before leaving the page.",
    icon: ScrollText,
  },
  {
    title: "Attention and engagement",
    detail: "Compare active attention bands with SEO landing-page performance.",
    icon: Eye,
  },
];

function ClarityRoute() {
  return (
    <div className="h-full overflow-auto bg-base-100">
      <div className="mx-auto w-full max-w-5xl space-y-8 p-4 py-8 pb-24 sm:p-6 md:py-12 md:pb-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              Behavior analytics
            </p>
            <h1 className="text-2xl font-bold tracking-tight">
              Microsoft Clarity
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-base-content/60">
              Understand what visitors do after they arrive from search. Connect
              a Clarity project to populate these views with heatmap and
              engagement summaries.
            </p>
          </div>
          <span className="badge badge-warning gap-1.5 py-3">
            <Activity className="size-3.5" /> Setup required
          </span>
        </div>

        <section className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <MousePointerClick className="size-5" />
            </div>
            <div>
              <h2 className="font-semibold">Connect your Clarity project</h2>
              <p className="mt-1 text-sm text-base-content/60">
                This repository does not have a Clarity connector yet. Add the
                project ID and an admin-created Data Export API token in the
                server integration before enabling live summaries. Keep the
                token server-side and never expose it in the browser.
              </p>
              <a
                className="btn btn-primary btn-sm mt-4"
                href="https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api"
                target="_blank"
                rel="noreferrer"
              >
                View Clarity setup guide
              </a>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-semibold">Planned behavior reports</h2>
            <span className="badge badge-ghost">Awaiting connection</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {modules.map(({ title, detail, icon: Icon }) => (
              <article
                key={title}
                className="rounded-xl border border-base-300 bg-base-100 p-5"
              >
                <Icon className="size-5 text-primary" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-base-content/60">{detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-base-300 bg-base-200/40 p-5 text-sm text-base-content/70 sm:p-6">
          <h2 className="font-semibold text-base-content">
            Integration boundary
          </h2>
          <p className="mt-2">
            Clarity’s documented export API returns project-level insight
            summaries for recent windows. Native visual heatmap screenshots, DOM
            coordinates, and session replay data remain in the Clarity product
            unless a separate supported export becomes available. DGTL SEO
            should label these definitions clearly beside GA4 and Search Console
            metrics.
          </p>
        </section>
      </div>
    </div>
  );
}
