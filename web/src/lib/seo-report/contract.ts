// What POST /api/seo-report takes and answers. The page here and SF SEO's
// form both read these, so a change is a change to a public contract:
// docs/maintainers/free-seo-report.md has it in words.

export const SEO_REPORT_API_PATH = "/api/seo-report";

/** A request that was taken. An email follows each of them. */
export enum SeoReportAccepted {
  /** Being written now. The email arrives in about five minutes. */
  Writing = "writing",
  /** Waiting for a slot. The email arrives within a day. */
  InLine = "in_line",
  /** The site has a recent report. Its link was emailed just now. */
  Sent = "sent",
}

/** A request that was turned away. Nothing was started and no email follows. */
export enum SeoReportRefusal {
  InvalidRequest = "invalid_request",
  InvalidSite = "invalid_site",
  InvalidEmail = "invalid_email",
  SiteNotFound = "site_not_found",
  /** The site asked for no reports. */
  Removed = "removed",
  NotHuman = "not_human",
  OriginNotAllowed = "origin_not_allowed",
  /** More than five submissions a minute from one visitor. */
  RateLimited = "rate_limited",
  EmailLimit = "email_limit",
  NetworkLimit = "network_limit",
  /** The whole tool has promised all the emails it sends in a day. */
  DayFull = "day_full",
  LineFull = "line_full",
  /** Too many people are already waiting on this one site's report. */
  SiteBusy = "site_busy",
  /** A secret it needs is missing, or something it depends on is down. */
  Unavailable = "unavailable",
}

export type SeoReportStatus = SeoReportAccepted | SeoReportRefusal;

/** The body of every answer. `message` is the sentence this site shows for `status`. */
export type SeoReportResponse = { status: SeoReportStatus; message: string };

/** New reports one network can ask for in a day. Named in its refusal. */
export const REPORTS_PER_NETWORK_PER_DAY = 3;

export const SEO_REPORT_MESSAGES: Record<SeoReportStatus, string> = {
  [SeoReportAccepted.Writing]: "Check your inbox in about 5 minutes.",
  [SeoReportAccepted.InLine]:
    "You're in line. We'll email your report within about a day.",
  [SeoReportAccepted.Sent]:
    "This site's report is already written. We've emailed you the link.",
  [SeoReportRefusal.InvalidRequest]: "Something went wrong. Try again.",
  [SeoReportRefusal.InvalidSite]: "Enter a website, like yourcompany.com.",
  [SeoReportRefusal.InvalidEmail]: "Enter an email address.",
  [SeoReportRefusal.SiteNotFound]: "We couldn't find that site.",
  [SeoReportRefusal.Removed]: "We don't write reports for that site.",
  [SeoReportRefusal.NotHuman]:
    "Human verification failed. Refresh the page and try again.",
  [SeoReportRefusal.OriginNotAllowed]:
    "Cross-site submissions are not allowed.",
  [SeoReportRefusal.RateLimited]: "Too many tries. Try again in a minute.",
  [SeoReportRefusal.EmailLimit]:
    "That address has already asked for a report today. Try again tomorrow.",
  [SeoReportRefusal.NetworkLimit]: `Your network has asked for ${REPORTS_PER_NETWORK_PER_DAY} reports today. Try again tomorrow.`,
  [SeoReportRefusal.DayFull]:
    "We've sent all the reports we can today. Try again tomorrow.",
  [SeoReportRefusal.LineFull]: "The line is full. Try again in a few hours.",
  [SeoReportRefusal.SiteBusy]:
    "Too many people are already waiting on this site's report.",
  [SeoReportRefusal.Unavailable]: "Reports aren't available right now.",
};

/** The HTTP status sent with each answer. Clients should read `status`, not this. */
export const SEO_REPORT_HTTP: Record<SeoReportStatus, number> = {
  [SeoReportAccepted.Writing]: 200,
  [SeoReportAccepted.InLine]: 200,
  [SeoReportAccepted.Sent]: 200,
  [SeoReportRefusal.InvalidRequest]: 400,
  [SeoReportRefusal.InvalidSite]: 400,
  [SeoReportRefusal.InvalidEmail]: 400,
  [SeoReportRefusal.SiteNotFound]: 400,
  [SeoReportRefusal.Removed]: 403,
  [SeoReportRefusal.NotHuman]: 403,
  [SeoReportRefusal.OriginNotAllowed]: 403,
  [SeoReportRefusal.RateLimited]: 429,
  [SeoReportRefusal.EmailLimit]: 429,
  [SeoReportRefusal.NetworkLimit]: 429,
  [SeoReportRefusal.DayFull]: 429,
  [SeoReportRefusal.LineFull]: 429,
  [SeoReportRefusal.SiteBusy]: 429,
  [SeoReportRefusal.Unavailable]: 503,
};

export const isAccepted = (
  status: SeoReportStatus,
): status is SeoReportAccepted =>
  status === SeoReportAccepted.Writing ||
  status === SeoReportAccepted.InLine ||
  status === SeoReportAccepted.Sent;

/** The answer to GET /api/seo-report: whether the tool can take a request. */
export type SeoReportAvailability = { open: boolean };
