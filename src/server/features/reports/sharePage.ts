import { createServerOnlyFn } from "@tanstack/react-start";
import {
  getRequest,
  setResponseHeader,
  setResponseStatus,
} from "@tanstack/react-start/server";
import { ReportRepository } from "@/server/features/reports/repositories/ReportRepository";
import {
  SHARE_TOKEN_PATTERN,
  sharesEnabled,
} from "@/server/features/reports/shareAccess";
import { sharePath } from "@/shared/report-share";

/** What `/s/<token>` renders, and all it is told. No report or project id. */
type SharePageData = {
  state: "ok" | "archived" | "missing";
  title: string;
  /** Open Graph description: the summary's first line, or "" when there is none. */
  description: string;
  /** Absolute canonical URL, for og:url. */
  url: string;
  /** When the report was last saved, for the bar's "Updated …". */
  updatedAt: string;
};

const MAX_DESCRIPTION_CHARS = 200;

/**
 * The link preview's description: the summary's first non-empty line, capped.
 * The summary is markdown, and no attempt is made to render it — a stray `##`
 * in a preview is a smaller problem than a stripper that eats a leading minus
 * sign off a number.
 */
function shareDescription(summary: string): string {
  const line = summary
    .split("\n")
    .map((raw) => raw.trim())
    .find((raw) => raw.length > 0);
  if (!line) return "";
  return line.length > MAX_DESCRIPTION_CHARS
    ? `${line.slice(0, MAX_DESCRIPTION_CHARS - 1).trimEnd()}…`
    : line;
}

/**
 * The public page's loader. Server-only rather than a server function: every
 * server function in this app runs ensureUserMiddleware, and this page has no
 * user. `createServerOnlyFn` is the framework's marker for that — the body and
 * its imports are compiled out of the client bundle. The route pins
 * `shouldReload: false` so nothing ever calls it from the browser.
 *
 * An unknown token, an unshared report and a switched-off kill switch are all
 * "missing": a shared link that was revoked must not confirm it once existed.
 */
export const loadSharePage = createServerOnlyFn(
  async (token: string): Promise<SharePageData> => {
    const url = new URL(getRequest().url);
    const canonical = `${url.origin}${sharePath(token)}`;
    // Every dead end answers 404, so a crawler, a monitor or a browser's
    // history sees a page that is not there rather than a 200 with an apology.
    // The archived page keeps the generic title too: the reader is told the
    // project is archived, and the report's own title is content the link no
    // longer grants access to.
    const unavailable = (state: "missing" | "archived"): SharePageData => {
      setResponseStatus(404);
      return {
        state,
        title: "Report unavailable",
        description: "",
        url: canonical,
        updatedAt: "",
      };
    };

    // The page carries the title and summary in its head, so a revoked link
    // must not live on in an intermediary cache any longer than the document.
    setResponseHeader("Cache-Control", "no-store");
    if (!(await sharesEnabled())) return unavailable("missing");
    if (!SHARE_TOKEN_PATTERN.test(token)) return unavailable("missing");

    const report = await ReportRepository.getSharedReportByToken(token);
    if (!report) return unavailable("missing");
    if (report.archived) return unavailable("archived");

    return {
      state: "ok",
      title: report.title,
      description: shareDescription(report.summary),
      url: canonical,
      updatedAt: report.updatedAt,
    };
  },
);
