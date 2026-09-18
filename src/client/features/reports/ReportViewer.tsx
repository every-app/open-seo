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
  return (
    <iframe
      src={src}
      sandbox={REPORT_IFRAME_SANDBOX}
      referrerPolicy="no-referrer"
      title={title}
      className={
        className ??
        "h-full w-full rounded-lg border border-base-300 bg-base-100"
      }
    />
  );
}
