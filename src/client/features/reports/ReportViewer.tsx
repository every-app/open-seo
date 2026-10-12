import { useState } from "react";
import { SkeletonTableRows } from "@/client/components/SkeletonPresets";
import { Skeleton } from "@/client/components/ui/skeleton";
import { REPORT_IFRAME_SANDBOX } from "@/shared/report-sandbox";

/**
 * The only place the app renders model-written HTML, in the app and on the
 * public share page. Everything that keeps it safe is the `sandbox` attribute
 * plus the CSP the document response sets; the token list is shared with that
 * header so a link behaves the same framed and top-level, and
 * `allow-same-origin` is never added.
 *
 * Framed, the document is served byte for byte — the app injects nothing here.
 * The only injection is the print script on `?print=1`, which this viewer
 * never requests.
 *
 * A spinner covers the frame until the document loads. The sandbox hides the
 * response status from the app, so a failed load shows the error text the
 * render route writes into the frame.
 */
export function ReportViewer({
  src,
  title,
  className,
}: {
  src: string;
  title: string;
  className?: string;
}) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  return (
    <div className="relative h-full w-full">
      <iframe
        src={src}
        sandbox={REPORT_IFRAME_SANDBOX}
        referrerPolicy="no-referrer"
        title={title}
        onLoad={() => setLoadedSrc(src)}
        className={
          className ?? "h-full w-full rounded-lg border border-border bg-card"
        }
      />
      {loadedSrc !== src ? (
        // A document-shaped placeholder over the frame until the report loads.
        <div
          className="absolute inset-0 space-y-3 overflow-hidden p-6"
          aria-busy
        >
          <Skeleton className="h-7 w-2/5" />
          <Skeleton className="h-4 w-3/5" />
          <SkeletonTableRows rows={8} columns={4} className="pt-4" />
        </div>
      ) : null}
    </div>
  );
}
