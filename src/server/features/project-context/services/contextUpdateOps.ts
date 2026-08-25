import { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinksTarget";
import { AppError } from "@/server/lib/errors";
import {
  CUSTOM_SECTION_KEY_PREFIX,
  PROSE_MAX_CHARS,
  type KeyPageRole,
  type ProjectContextUpdate,
} from "@/types/schemas/projectContext";

/**
 * Canonicalize a key-page URL so the same page is one row: force https, strip
 * a leading www and the fragment, lowercase the host (URL does), keep the path
 * and query — unlike backlinks targets, real pages may live behind a query
 * string. Bare "example.com" gets https:// prepended.
 */
function normalizeKeyPageUrl(raw: string): string {
  const input = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
    ? input
    : `https://${input}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new AppError("VALIDATION_ERROR", `Not a valid page URL: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AppError("VALIDATION_ERROR", `Not a valid page URL: ${raw}`);
  }
  url.protocol = "https:";
  url.hash = "";
  url.hostname = url.hostname.replace(/^www\./, "");
  const href = url.toString();
  // "example.com" round-trips as "example.com/"; keep the bare-host form.
  return url.pathname === "/" && !url.search ? href.replace(/\/$/, "") : href;
}

// Turning a batch of patch ops into the writes it implies. Kept apart from the
// service because none of it touches storage: it trims, normalizes and checks
// the caps that keep a project's context small enough to inject into every SAM
// turn and return cheaply from MCP.
const MAX_CUSTOM_SECTIONS = 20;
const MAX_COMPETITORS = 100;
const MAX_KEY_PAGES = 100;

function assertProseFits(content: string) {
  if (content.length > PROSE_MAX_CHARS) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Sections are capped at ${PROSE_MAX_CHARS} characters. Summarize instead of pasting.`,
    );
  }
}

// A batch upsert must not touch the same conflict target twice (Postgres
// refuses it outright), so a repeated domain/url within one op collapses to its
// last occurrence.
function dedupeBy<T>(rows: T[], key: (row: T) => string): T[] {
  return [...new Map(rows.map((row) => [key(row), row])).values()];
}

// The write each patch op resolves to, once its content is trimmed, its
// domains/urls are normalized and the caps have been checked.
type ResolvedOp =
  | {
      kind: "upsertSection";
      key: string;
      title: string | null;
      content: string;
    }
  | { kind: "deleteSection"; key: string }
  | {
      kind: "upsertCompetitors";
      rows: { domain: string; name: string | null; notes: string | null }[];
    }
  | { kind: "deleteCompetitors"; domains: string[] }
  | {
      kind: "upsertKeyPages";
      rows: {
        url: string;
        role: KeyPageRole | null;
        topic: string | null;
        notes: string | null;
      }[];
    }
  | { kind: "deleteKeyPages"; urls: string[] }
  | { kind: "appendResearchLog"; summary: string }
  | { kind: "deleteResearchLog"; ids: string[] };

/**
 * Resolves the batch against the state as it evolves, so a single call cannot
 * slip past a cap by splitting one list across several ops. Nothing is written
 * here: a rejected op throws before the first write, which is what keeps a
 * partially-applied batch impossible.
 */
export function resolveContextUpdates(
  updates: ProjectContextUpdate[],
  current: {
    customKeys: Set<string>;
    domains: Set<string>;
    urls: Set<string>;
  },
): ResolvedOp[] {
  const { customKeys, domains, urls } = current;
  const resolved: ResolvedOp[] = [];

  const resolveOne = (update: ProjectContextUpdate) => {
    if ("section" in update) {
      const content = update.content.trim();
      assertProseFits(content);
      // Empty clears the section: the row goes away, so it reads back as
      // missing rather than as an empty section nobody notices.
      resolved.push(
        content === ""
          ? { kind: "deleteSection", key: update.section }
          : {
              kind: "upsertSection",
              key: update.section,
              title: null,
              content,
            },
      );
      return;
    }

    if ("customSection" in update) {
      const key = `${CUSTOM_SECTION_KEY_PREFIX}${update.customSection}`;
      const content = update.content.trim();
      assertProseFits(content);
      if (content === "") {
        resolved.push({ kind: "deleteSection", key });
        customKeys.delete(key);
        return;
      }
      if (!customKeys.has(key) && customKeys.size >= MAX_CUSTOM_SECTIONS) {
        throw new AppError(
          "VALIDATION_ERROR",
          `A project can hold ${MAX_CUSTOM_SECTIONS} custom sections. Delete one first.`,
        );
      }
      resolved.push({
        kind: "upsertSection",
        key,
        title: update.title ?? null,
        content,
      });
      customKeys.add(key);
      return;
    }

    if ("deleteCustomSection" in update) {
      const key = `${CUSTOM_SECTION_KEY_PREFIX}${update.deleteCustomSection}`;
      resolved.push({ kind: "deleteSection", key });
      customKeys.delete(key);
      return;
    }

    if ("addCompetitors" in update) {
      const rows = dedupeBy(
        update.addCompetitors.map((competitor) => ({
          // Same canonicalization as the project's own domain, so the same
          // competitor entered as a URL, with www, or in caps is one row.
          domain: normalizeBacklinksTarget(competitor.domain, {
            scope: "domain",
          }).apiTarget,
          name: competitor.name ?? null,
          notes: competitor.notes ?? null,
        })),
        (row) => row.domain,
      );
      const additions = rows.filter((row) => !domains.has(row.domain)).length;
      if (domains.size + additions > MAX_COMPETITORS) {
        throw new AppError(
          "VALIDATION_ERROR",
          `A project can track ${MAX_COMPETITORS} competitors. Remove some first.`,
        );
      }
      resolved.push({ kind: "upsertCompetitors", rows });
      for (const row of rows) domains.add(row.domain);
      return;
    }

    if ("removeCompetitors" in update) {
      const removed = update.removeCompetitors.map(
        (domain) =>
          normalizeBacklinksTarget(domain, { scope: "domain" }).apiTarget,
      );
      resolved.push({ kind: "deleteCompetitors", domains: removed });
      for (const domain of removed) domains.delete(domain);
      return;
    }

    if ("addKeyPages" in update) {
      const rows = dedupeBy(
        update.addKeyPages.map((page) => ({
          url: normalizeKeyPageUrl(page.url),
          role: page.role ?? null,
          topic: page.topic ?? null,
          notes: page.notes ?? null,
        })),
        (row) => row.url,
      );
      const additions = rows.filter((row) => !urls.has(row.url)).length;
      if (urls.size + additions > MAX_KEY_PAGES) {
        throw new AppError(
          "VALIDATION_ERROR",
          `A project can hold ${MAX_KEY_PAGES} key pages. This is a shortlist, not a page inventory.`,
        );
      }
      resolved.push({ kind: "upsertKeyPages", rows });
      for (const row of rows) urls.add(row.url);
      return;
    }

    if ("removeKeyPages" in update) {
      const removed = update.removeKeyPages.map(normalizeKeyPageUrl);
      resolved.push({ kind: "deleteKeyPages", urls: removed });
      for (const url of removed) urls.delete(url);
      return;
    }

    if ("removeResearchLog" in update) {
      resolved.push({
        kind: "deleteResearchLog",
        ids: update.removeResearchLog,
      });
      return;
    }

    resolved.push({
      kind: "appendResearchLog",
      summary: update.appendResearchLog.summary,
    });
  };

  updates.forEach((update, index) => {
    try {
      resolveOne(update);
    } catch (error) {
      // The batch is atomic, so name the op that sank it — an agent retrying
      // a multi-op batch needs to know which entry to fix.
      throw error instanceof AppError
        ? new AppError(
            error.code,
            `updates[${index}] was rejected (nothing in this batch was applied): ${error.message}`,
          )
        : error;
    }
  });

  return resolved;
}
