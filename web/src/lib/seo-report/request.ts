import {
  readToolBody,
  ToolGuard,
  verifyToolRequest,
} from "@/lib/free-tools/server";
import { desk, partnerOrigins, reportsOpen, type SeoReportEnv } from "./config";
import { z } from "zod";
import { SeoReportRefusal, type SeoReportStatus } from "./contract";
import { siteExists } from "./dns";
import { isRemoved } from "./removed";
import { emailSchema, mailbox, networkOf, reportSite, sha256Hex } from "./site";

// What happens when the form is sent, from this site's page or a partner's.
// The checks that cost nothing come first, in this order: that the tool is
// configured, the
// request's shape, the website's, the email's, then that a person sent it
// from a site allowed to (origin, rate limit, Turnstile), the removal list
// and DNS. Only then does the desk count the request against every limit and
// give it a place, in one step (desk.ts). A refused request has taken
// nothing, so nothing is ever given back.

const requestSchema = z.object({
  site: z.string().max(300),
  email: z.string().max(254),
  turnstileToken: z.string().max(2048).optional(),
});

const GUARD_REFUSALS: Record<ToolGuard, SeoReportRefusal> = {
  [ToolGuard.CrossSite]: SeoReportRefusal.OriginNotAllowed,
  [ToolGuard.RateLimited]: SeoReportRefusal.RateLimited,
  [ToolGuard.NotHuman]: SeoReportRefusal.NotHuman,
  [ToolGuard.Unavailable]: SeoReportRefusal.Unavailable,
};

export async function requestReport(
  request: Request,
  env: SeoReportEnv,
): Promise<SeoReportStatus> {
  if (!reportsOpen(env)) return SeoReportRefusal.Unavailable;
  const body = await readToolBody(request);
  const input = requestSchema.safeParse(body instanceof Response ? null : body);
  if (!input.success) return SeoReportRefusal.InvalidRequest;
  const site = reportSite(input.data.site);
  if (!site) return SeoReportRefusal.InvalidSite;
  const email = emailSchema.safeParse(input.data.email);
  if (!email.success) return SeoReportRefusal.InvalidEmail;

  const verified = await verifyToolRequest({
    tool: "seo-report",
    request,
    turnstileToken: input.data.turnstileToken,
    partnerOrigins: partnerOrigins(env),
  });
  if ("refused" in verified) return GUARD_REFUSALS[verified.refused];
  if (isRemoved(site)) return SeoReportRefusal.Removed;
  if (!(await siteExists(site))) return SeoReportRefusal.SiteNotFound;

  // Only local development lacks Cloudflare's header: a deployed request
  // without it was refused above.
  const network =
    networkOf(request.headers.get("cf-connecting-ip") ?? "") ?? "local";
  const here = new URL(request.url).hostname;
  return desk(env).ask({
    site,
    email: email.data,
    // Where the form was, from the hostname Turnstile verified. The email
    // names it; the request can't choose it.
    source: verified.host === here ? `${here}/seo-report` : verified.host,
    mailbox: await sha256Hex(`mailbox:${mailbox(email.data)}`),
    network: await sha256Hex(`network:${network}`),
  });
}
