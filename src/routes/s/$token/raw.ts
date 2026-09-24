import { waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { ReportRepository } from "@/server/features/reports/repositories/ReportRepository";
import {
  SHARE_TOKEN_PATTERN,
  sharesEnabled,
} from "@/server/features/reports/shareAccess";
import { captureServerEvent } from "@/server/lib/posthog";
import { reportDocumentResponse, textResponse } from "@/shared/report-sandbox";
import { sharePath } from "@/shared/report-share";

// The shared report's document, served to anyone holding the token. The twin
// of /r/<reportId>: same stored HTML, same REPORT_CSP sandbox, but authorized
// by the unguessable token instead of a session.
//
// A raw-Response route, so no React and no auth guard runs — and no
// `component`, on purpose: a component would pull this file (and
// `cloudflare:workers` with it) into the client bundle.

// One body for every dead end — unknown token, revoked link, archived project,
// kill switch off. A revoked link must not confirm that it once worked.
const NOT_SHARED_BODY = "This report isn't shared.";

/**
 * How long a colo may keep the document. A revoked link keeps loading for up
 * to this long from an edge that already has it, which is what the share modal
 * tells the user. ETags are deliberately out of scope: a revalidation answered
 * before the token lookup would make revocation advisory.
 */
const EDGE_CACHE_CONTROL = "public, max-age=0, s-maxage=60";

/** Every redirect this endpoint answers: never stored, by anyone. */
const bounceTo = (location: string) =>
  new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store" },
  });

/**
 * A stable pseudonym for one link, so views can be counted per report without
 * a person profile and without putting the token itself (the capability) into
 * PostHog.
 */
async function shareDistinctId(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `share:${hex.slice(0, 16)}`;
}

async function handleSharedReportRequest(
  token: string,
  request: Request,
): Promise<Response> {
  const notShared = () => textResponse(NOT_SHARED_BODY, 404);

  if (!(await sharesEnabled())) return notShared();
  // Shape first, so a scanner walking /s/<anything>/raw costs no query.
  if (!SHARE_TOKEN_PATTERN.test(token)) return notShared();

  // The query string is part of the cache key, so `?cachebust=<random>` would
  // otherwise turn every request back into an origin hit. Bounce to the bare
  // path before any query runs: there is no parameter this endpoint reads.
  const url = new URL(request.url);
  if (url.search !== "") return bounceTo(`${sharePath(token)}/raw`);

  const report = await ReportRepository.getSharedReportByToken(token);
  if (!report || report.archived) return notShared();

  // The document is only ever reachable inside the wrapper page's frame, so
  // shared content always carries the product's chrome; there is no print mode
  // here, because a cancelled print dialog would leave a bare report open
  // top-level on the app domain. Members print from the app. The redirect
  // needs the header to say the request is top-level: a client that sends no
  // Sec-Fetch-Dest at all (an old browser, a link-preview fetcher, curl) would
  // otherwise be bounced to a page whose frame it cannot load either, so an
  // absent header is served the document.
  //
  // The 200 is cached at the edge for 60s, so it must vary on Sec-Fetch-Dest:
  // otherwise a top-level navigation right after a framed load would be served
  // the bare document from cache instead of the bounce below. The redirect
  // path is a 302 served `no-store`; a shared cache stores neither it nor the
  // 404.
  const dest = request.headers.get("Sec-Fetch-Dest");
  if (dest !== null && dest !== "iframe") return bounceTo(sharePath(token));

  const html = await ReportRepository.getReportHtml(
    report.projectId,
    report.id,
  );
  if (html === null) return notShared();

  waitUntil(
    (async () => {
      await captureServerEvent({
        distinctId: await shareDistinctId(token),
        event: "report:public_view",
        organizationId: report.organizationId,
        properties: {
          report_id: report.id,
          project_id: report.projectId,
          skill: report.skill,
          // Kept so link-preview bots can be excluded from the count.
          user_agent: request.headers.get("User-Agent"),
          // Readers are anonymous and stay that way: no person profile is
          // created for a share pseudonym.
          $process_person_profile: false,
        },
      });
    })(),
  );

  return reportDocumentResponse(html, {
    cacheControl: EDGE_CACHE_CONTROL,
    noindex: true,
    vary: "Sec-Fetch-Dest",
  });
}

export const Route = createFileRoute("/s/$token/raw")({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        handleSharedReportRequest(params.token, request),
    },
  },
});

export { handleSharedReportRequest, NOT_SHARED_BODY };
