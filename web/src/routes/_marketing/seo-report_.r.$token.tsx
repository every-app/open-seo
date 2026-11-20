import { createFileRoute, notFound } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { NotFound } from "@/components/not-found";
import type { SeoReportEnv } from "@/lib/seo-report/config";
import { readReport } from "@/lib/seo-report/read";

// A written report, reached only by the link in its email. The link
// downloads the report as a PDF: there is no page to read it on.

export const Route = createFileRoute("/_marketing/seo-report_/r/$token")({
  server: {
    handlers: {
      GET: async ({ params, next }) => {
        const report = await readReport(
          env as unknown as SeoReportEnv,
          params.token,
        );
        // A link with no report behind it gets the site's "not found" page.
        if (!report) return next();
        // Loaded here, so the PDF library is only ever started to send a report.
        const { reportPdf } = await import("@/lib/seo-report/pdf");
        return new Response(await reportPdf(report), {
          headers: {
            "Content-Type": "application/pdf",
            // The site is a checked hostname (site.ts), so it is safe in a file name.
            "Content-Disposition": `attachment; filename="seo-report-${report.site}.pdf"`,
            "X-Robots-Tag": "noindex, nofollow",
            // The link is the only way to the report, so no cache may keep it.
            "Cache-Control": "private, no-store",
          },
        });
      },
    },
  },
  // The only page here is "not found", answered as a 404.
  loader: () => {
    throw notFound();
  },
  component: NotFound,
});
