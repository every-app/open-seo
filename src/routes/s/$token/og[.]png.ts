import { createFileRoute } from "@tanstack/react-router";
import { ReportRepository } from "@/server/features/reports/repositories/ReportRepository";
import {
  SHARE_TOKEN_PATTERN,
  sharesEnabled,
} from "@/server/features/reports/shareAccess";
import { textResponse } from "@/shared/report-sandbox";
import { brand } from "@/shared/brand";

export async function handleReportSocialImage(
  token: string,
): Promise<Response> {
  if (!(await sharesEnabled()) || !SHARE_TOKEN_PATTERN.test(token)) {
    return textResponse("This report isn't shared.", 404);
  }
  const report = await ReportRepository.getSharedReportByToken(token);
  if (!report || report.archived) {
    return textResponse("This report isn't shared.", 404);
  }

  // Keep the renderer and WASM out of the app's eager startup graph, and do
  // not initialize either for invalid, revoked, or archived shares.
  try {
    const { renderReportSocialImage } =
      await import("@/server/features/reports/reportSocialImage");
    return await renderReportSocialImage(report.title, report.projectDomain);
  } catch (error) {
    console.error("Report social image rendering failed", error);
    return new Response(null, {
      status: 302,
      headers: {
        Location: brand.socialCardUrl,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }
}

export const Route = createFileRoute("/s/$token/og.png")({
  server: {
    handlers: {
      GET: ({ params }) => handleReportSocialImage(params.token),
    },
  },
});
