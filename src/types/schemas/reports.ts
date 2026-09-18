// Shared vocabulary for reports. The MCP tools, the server functions and the
// app all import these constants and this type, so the caps and the wire shape
// of a save are defined once.

/**
 * UTF-8 byte cap on a stored document, measured with TextEncoder (not
 * `String.length`, which counts UTF-16 code units and understates multi-byte
 * content). Chosen for the app worker's heap, not for storage: a save is parsed
 * out of JSON-RPC, copied by TextEncoder and bound into a statement on a worker
 * whose P90 heap already sits near its limit. Reports should aim well under
 * 80,000 bytes; this is the refusal line, not the target.
 */
export const REPORT_MAX_HTML_BYTES = 500_000;
/**
 * Runaway-storage guard per project, enforced on create only. It is not a
 * product limit: no real project writes ten thousand reports, so the number a
 * user hits is a loop that got stuck, not a workflow.
 */
export const REPORT_MAX_PER_PROJECT = 10_000;
/**
 * Runaway-storage guard for a whole organization, across every project it
 * owns. Projects are unlimited, so the per-project guard bounds nothing on its
 * own; this is the line that actually bounds free, unmetered writes. Set at
 * the per-project guard times the 500 KB per-report cap, which no workspace
 * writing reports by hand will approach.
 */
export const REPORT_MAX_BYTES_PER_ORG = 5_000_000_000;
/** Page size for a list read when the caller does not ask for one. */
export const REPORT_DEFAULT_LIST_LIMIT = 20;
/** Ceiling on a single list page, for the MCP tool's payload budget. */
export const REPORT_MAX_LIST_LIMIT = 50;
/** The Reports page shows the most recent 100. */
export const REPORT_APP_LIST_LIMIT = 100;
export const REPORT_MAX_TITLE_CHARS = 120;
/** A skill slug is a directory name; anything longer is not one. */
export const REPORT_MAX_SKILL_CHARS = 60;
export const REPORT_MAX_SUMMARY_CHARS = 2_500;

/**
 * Everything a list or detail read returns. `html` is deliberately absent: it
 * is read only by getReportHtml, so no list path can pull documents into the
 * worker's heap.
 *
 * A plain type, not a Zod schema: these rows are built by the repository from
 * its own column selection, so there is no trust boundary here to validate.
 */
export type ReportMetadata = {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  skill: string | null;
  /** The report template the agent followed, or null. Unresolved: the name is
   *  looked up project-scoped by the reader that needs it. */
  templateId: string | null;
  createdBy: string;
  createdByUserId: string;
  /** UTF-8 byte length of the stored document. */
  sizeBytes: number;
  /**
   * The public share token, or null when the report is not shared. The app
   * builds the link from it (`<origin>/s/<token>`) rather than storing a URL,
   * so the same row works on the hosted domain and a self-hosted one.
   */
  shareToken: string | null;
  /** When the current share token was minted, or null when not shared. */
  sharedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
