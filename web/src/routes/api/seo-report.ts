import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { jsonResponse } from "@/lib/free-tools/server";
import {
  partnerOrigins,
  reportsOpen,
  type SeoReportEnv,
} from "@/lib/seo-report/config";
import {
  SEO_REPORT_HTTP,
  SEO_REPORT_MESSAGES,
  SeoReportRefusal,
  type SeoReportAvailability,
  type SeoReportResponse,
} from "@/lib/seo-report/contract";
import { requestReport } from "@/lib/seo-report/request";

// The SEO report tool's API: docs/maintainers/free-seo-report.md.

const reportEnv = () => env as unknown as SeoReportEnv;

/** A partner's page may read the answer. Nothing else follows from being listed. */
function cors(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return origin && partnerOrigins(reportEnv()).includes(origin)
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : {};
}

export const Route = createFileRoute("/api/seo-report")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => {
        const headers = cors(request);
        if (!Object.keys(headers).length)
          return new Response(null, { status: 403 });
        return new Response(null, {
          status: 204,
          headers: {
            ...headers,
            "Access-Control-Allow-Methods": "GET, POST",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
          },
        });
      },
      GET: ({ request }) => {
        const availability: SeoReportAvailability = {
          open: reportsOpen(reportEnv()),
        };
        return jsonResponse(availability, 200, {
          "Cache-Control": "no-store",
          ...cors(request),
        });
      },
      POST: async ({ request }) => {
        // A request that throws may already be counted, and a bare error
        // would reach a partner's page with no CORS header at all.
        const status = await requestReport(request, reportEnv()).catch(
          (error: unknown) => {
            console.error(
              JSON.stringify({
                event: "seo_report_request_failed",
                message: error instanceof Error ? error.message : "unknown",
              }),
            );
            return SeoReportRefusal.Unavailable;
          },
        );
        const answer: SeoReportResponse = {
          status,
          message: SEO_REPORT_MESSAGES[status],
        };
        return jsonResponse(answer, SEO_REPORT_HTTP[status], {
          "Cache-Control": "no-store",
          ...cors(request),
        });
      },
    },
  },
});
