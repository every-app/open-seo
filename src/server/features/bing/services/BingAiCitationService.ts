import Papa from "papaparse";
import { AppError } from "@/server/lib/errors";
import {
  BingAiCitationDayRepository,
  type BingAiCitationDay,
} from "@/server/features/bing/repositories/BingAiCitationDayRepository";
import {
  BingAiCitationSnapshotRepository,
  type BingAiCitationSnapshot,
  type BingAiPageCitation,
  type BingAiQueryCitation,
} from "@/server/features/bing/repositories/BingAiCitationSnapshotRepository";

/**
 * Bing Webmaster Tools' "AI performance" report (citations in Copilot/AI
 * answers) has no API — only CSV exports. This mirrors the manual-import
 * shape of RapidapiService, but for three distinct report shapes. See
 * specs/0015.
 */

const OVERVIEW_HEADERS = ["Date", "Citations", "Cited Pages"];
const PAGES_HEADERS = ["Page", "Citations"];
const QUERIES_HEADERS = [
  "Grounding Query",
  "Intent",
  "Topic",
  "Citations",
  "Citation Share",
];

// Bing exports dates as "7/1/2026 12:00:00 AM" (M/D/YYYY). Parsed explicitly
// rather than via `new Date()`, which is locale-ambiguous for that format.
const BING_EXPORT_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;

export type BingAiOverviewRow = {
  date: string;
  citations: number;
  citedPages: number;
};
export type BingAiPageRow = { page: string; citations: number };
export type BingAiQueryRow = {
  query: string;
  intent: string;
  topic: string;
  citations: number;
  citationSharePercent: number;
};

function parseCsvRows(
  csvText: string,
  requiredHeaders: string[],
): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  const fields = parsed.meta.fields ?? [];
  const missing = requiredHeaders.filter((header) => !fields.includes(header));
  if (missing.length > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      `AI performance CSV is missing column(s): ${missing.join(", ")}`,
    );
  }
  return parsed.data;
}

function parseBingExportDate(raw: string): string {
  const match = BING_EXPORT_DATE_RE.exec(raw.trim());
  if (!match) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Unrecognized date "${raw}" in AI performance CSV`,
    );
  }
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseCount(raw: string, field: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Invalid ${field} "${raw}" in AI performance CSV`,
    );
  }
  return value;
}

function parseCitationSharePercent(raw: string): number {
  const value = Number.parseFloat(raw.replace("%", "").trim());
  if (!Number.isFinite(value)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Invalid citation share "${raw}" in AI performance CSV`,
    );
  }
  return value;
}

function requireNonEmpty(raw: string, field: string): string {
  const value = raw.trim();
  if (value === "") {
    throw new AppError(
      "VALIDATION_ERROR",
      `Missing ${field} in AI performance CSV`,
    );
  }
  return value;
}

export function parseOverviewCsv(csvText: string): BingAiOverviewRow[] {
  return parseCsvRows(csvText, OVERVIEW_HEADERS).map((row) => ({
    date: parseBingExportDate(row["Date"] ?? ""),
    citations: parseCount(row["Citations"] ?? "", "Citations"),
    citedPages: parseCount(row["Cited Pages"] ?? "", "Cited Pages"),
  }));
}

export function parsePagesCsv(csvText: string): BingAiPageRow[] {
  return parseCsvRows(csvText, PAGES_HEADERS).map((row) => ({
    page: requireNonEmpty(row["Page"] ?? "", "Page"),
    citations: parseCount(row["Citations"] ?? "", "Citations"),
  }));
}

export function parseQueriesCsv(csvText: string): BingAiQueryRow[] {
  return parseCsvRows(csvText, QUERIES_HEADERS).map((row) => ({
    query: requireNonEmpty(row["Grounding Query"] ?? "", "Grounding Query"),
    intent: requireNonEmpty(row["Intent"] ?? "", "Intent"),
    topic: requireNonEmpty(row["Topic"] ?? "", "Topic"),
    citations: parseCount(row["Citations"] ?? "", "Citations"),
    citationSharePercent: parseCitationSharePercent(
      row["Citation Share"] ?? "",
    ),
  }));
}

/** Picks the requested snapshot, or the newest one when `snapshotId` is
 *  null — exported for tests. `snapshots` must be sorted newest-first
 *  (repository order). */
export function resolveSnapshot(
  snapshots: BingAiCitationSnapshot[],
  snapshotId: string | null,
): BingAiCitationSnapshot | null {
  if (snapshotId === null) return snapshots[0] ?? null;
  return snapshots.find((snapshot) => snapshot.id === snapshotId) ?? null;
}

async function uploadOverview(input: {
  projectId: string;
  organizationId: string;
  uploadedByUserId: string;
  csvText: string;
}): Promise<{ rowCount: number }> {
  const rows = parseOverviewCsv(input.csvText);
  if (rows.length === 0) {
    throw new AppError("VALIDATION_ERROR", "AI performance CSV has no rows");
  }
  await BingAiCitationDayRepository.bulkUpsert(
    rows.map((row) => ({
      projectId: input.projectId,
      organizationId: input.organizationId,
      uploadedByUserId: input.uploadedByUserId,
      date: row.date,
      citations: row.citations,
      citedPages: row.citedPages,
    })),
  );
  return { rowCount: rows.length };
}

async function getOverview(projectId: string): Promise<BingAiCitationDay[]> {
  return BingAiCitationDayRepository.listByProjectId(projectId);
}

async function uploadPages(input: {
  projectId: string;
  organizationId: string;
  uploadedByUserId: string;
  csvText: string;
  periodStart: string;
  periodEnd: string;
}): Promise<BingAiCitationSnapshot> {
  const rows = parsePagesCsv(input.csvText);
  if (rows.length === 0) {
    throw new AppError("VALIDATION_ERROR", "AI performance CSV has no rows");
  }
  return BingAiCitationSnapshotRepository.createPagesSnapshot({
    ...input,
    rows,
  });
}

async function uploadQueries(input: {
  projectId: string;
  organizationId: string;
  uploadedByUserId: string;
  csvText: string;
  periodStart: string;
  periodEnd: string;
}): Promise<BingAiCitationSnapshot> {
  const rows = parseQueriesCsv(input.csvText);
  if (rows.length === 0) {
    throw new AppError("VALIDATION_ERROR", "AI performance CSV has no rows");
  }
  return BingAiCitationSnapshotRepository.createQueriesSnapshot({
    ...input,
    rows,
  });
}

async function getPagesSnapshotDetail(
  projectId: string,
  snapshotId: string | null,
): Promise<{
  snapshots: BingAiCitationSnapshot[];
  snapshot: BingAiCitationSnapshot | null;
  rows: BingAiPageCitation[];
}> {
  const snapshots = await BingAiCitationSnapshotRepository.listSnapshots(
    projectId,
    "pages",
  );
  const snapshot = resolveSnapshot(snapshots, snapshotId);
  const rows = snapshot
    ? await BingAiCitationSnapshotRepository.getPageCitations(
        projectId,
        snapshot.id,
      )
    : [];
  return { snapshots, snapshot, rows };
}

async function getQueriesSnapshotDetail(
  projectId: string,
  snapshotId: string | null,
): Promise<{
  snapshots: BingAiCitationSnapshot[];
  snapshot: BingAiCitationSnapshot | null;
  rows: BingAiQueryCitation[];
}> {
  const snapshots = await BingAiCitationSnapshotRepository.listSnapshots(
    projectId,
    "queries",
  );
  const snapshot = resolveSnapshot(snapshots, snapshotId);
  const rows = snapshot
    ? await BingAiCitationSnapshotRepository.getQueryCitations(
        projectId,
        snapshot.id,
      )
    : [];
  return { snapshots, snapshot, rows };
}

export const BingAiCitationService = {
  uploadOverview,
  getOverview,
  uploadPages,
  uploadQueries,
  getPagesSnapshotDetail,
  getQueriesSnapshotDetail,
};
