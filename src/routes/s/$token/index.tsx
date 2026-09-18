import { createFileRoute } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { ReportViewer } from "@/client/features/reports/ReportViewer";
import { formatRelativeTime } from "@/client/lib/relative-time";
import { loadSharePage } from "@/server/features/reports/sharePage";

// The public face of a shared report: no sign-in, no app shell, no sidebar.
// The document itself is never served into this page's origin — it comes from
// /s/<token>/raw inside the same sandboxed frame the in-app viewer uses, and
// that endpoint bounces anyone who opens it top-level back here, so shared
// content always carries this chrome.

const MARKETING_URL = "https://openseo.so/?utm_source=shared_report";
// The marketing site's card. Absolute because a link preview crawler resolves
// og:image against nothing, and the app domain does not serve this asset.
const SOCIAL_CARD_URL = "https://openseo.so/social-card.jpg";

// The share sheet on touch devices only; on desktop macOS anchors it to the
// window rather than the button, so the clipboard is used instead.
async function shareLink(title: string) {
  const url = window.location.href;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && typeof navigator.share === "function") {
    await navigator.share({ title, url }).catch(() => undefined);
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  } catch {
    toast.error("Clipboard not available");
  }
}

export const Route = createFileRoute("/s/$token/")({
  loader: ({ params }) => loadSharePage(params.token),
  // The loader is server-only (see sharePage.ts). Nothing on this page
  // navigates or invalidates, and this makes sure of it.
  shouldReload: false,
  staleTime: Infinity,
  head: ({ loaderData: data }) => {
    if (!data) return {};
    const title = `${data.title} · OpenSEO`;
    return {
      meta: [
        { title },
        // A shared report is a private link, not a page we want in an index.
        // The raw endpoint sets X-Robots-Tag for the same reason.
        { name: "robots", content: "noindex, nofollow" },
        { property: "og:type", content: "article" },
        { property: "og:site_name", content: "OpenSEO" },
        { property: "og:title", content: data.title },
        { name: "twitter:title", content: data.title },
        ...(data.description
          ? [
              { property: "og:description", content: data.description },
              { name: "description", content: data.description },
            ]
          : []),
        { property: "og:url", content: data.url },
        { property: "og:image", content: SOCIAL_CARD_URL },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: SharedReportPage,
});

/** The two dead ends — a link that was never shared or was revoked, and an archived project. */
function SharedReportMessage({
  heading,
  detail,
}: {
  heading: string;
  detail: string;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-lg font-medium">{heading}</h1>
      <p className="max-w-md text-sm text-base-content/60">{detail}</p>
      <a
        href={MARKETING_URL}
        target="_blank"
        rel="noreferrer"
        className="btn btn-primary btn-sm"
      >
        Try OpenSEO
      </a>
    </div>
  );
}

function SharedReportPage() {
  const { token } = Route.useParams();
  const data = Route.useLoaderData();

  if (data.state === "missing") {
    return (
      <SharedReportMessage
        heading="This report isn't shared."
        detail="The link may have been turned off, or the report may have been deleted."
      />
    );
  }

  if (data.state === "archived") {
    return (
      <SharedReportMessage
        heading="This project has been archived."
        detail="Its reports are hidden until the owner restores it."
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-base-200">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-base-300 bg-base-100 px-4 py-2">
        {/* Full width below `sm` so the title owns its own row and the buttons
            wrap under it instead of squeezing it to an ellipsis. */}
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <h1 className="truncate text-sm font-medium">{data.title}</h1>
          <p className="text-xs text-base-content/50">
            Made with OpenSEO · Updated {formatRelativeTime(data.updatedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1.5"
            onClick={() => void shareLink(data.title)}
          >
            <Share2 className="size-4" />
            <span className="hidden sm:inline">Share</span>
          </button>
          <a
            href={MARKETING_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary btn-sm"
          >
            Try OpenSEO
          </a>
        </div>
      </header>
      <ReportViewer
        src={`/s/${token}/raw`}
        title={data.title}
        className="min-h-0 flex-1 border-0 bg-base-100"
      />
    </div>
  );
}
