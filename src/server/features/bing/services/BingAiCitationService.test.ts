import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import type { BingAiCitationSnapshot } from "@/server/features/bing/repositories/BingAiCitationSnapshotRepository";
import {
  parseOverviewCsv,
  parsePagesCsv,
  parseQueriesCsv,
  resolveSnapshot,
} from "./BingAiCitationService";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock(
  "@/server/features/bing/repositories/BingAiCitationDayRepository",
  () => ({ BingAiCitationDayRepository: {} }),
);
vi.mock(
  "@/server/features/bing/repositories/BingAiCitationSnapshotRepository",
  () => ({ BingAiCitationSnapshotRepository: {} }),
);

describe("parseOverviewCsv", () => {
  it("parses Bing's export date format and counts", () => {
    const csv = [
      '"Date","Citations","Cited Pages"',
      '"7/1/2026 12:00:00 AM","8","4"',
      '"7/31/2026 12:00:00 AM","235","7"',
    ].join("\n");
    expect(parseOverviewCsv(csv)).toEqual([
      { date: "2026-07-01", citations: 8, citedPages: 4 },
      { date: "2026-07-31", citations: 235, citedPages: 7 },
    ]);
  });

  it("rejects a CSV missing a required column", () => {
    const csv = '"Date","Citations"\n"7/1/2026 12:00:00 AM","8"';
    expect(() => parseOverviewCsv(csv)).toThrow(AppError);
  });

  it("rejects an unrecognized date", () => {
    const csv = '"Date","Citations","Cited Pages"\n"not a date","8","4"';
    expect(() => parseOverviewCsv(csv)).toThrow(AppError);
  });
});

describe("parsePagesCsv", () => {
  it("parses page rows", () => {
    const csv = [
      '"Page","Citations"',
      '"https://scholar-sidekick.com/","352"',
      '"https://scholar-sidekick.com/glossary","295"',
    ].join("\n");
    expect(parsePagesCsv(csv)).toEqual([
      { page: "https://scholar-sidekick.com/", citations: 352 },
      { page: "https://scholar-sidekick.com/glossary", citations: 295 },
    ]);
  });
});

describe("parseQueriesCsv", () => {
  it("parses query rows including citation share", () => {
    const csv = [
      '"Grounding Query","Intent","Topic","Citations","Citation Share"',
      '"scholar sidekick","Navigational","Research","469","72.27%"',
    ].join("\n");
    expect(parseQueriesCsv(csv)).toEqual([
      {
        query: "scholar sidekick",
        intent: "Navigational",
        topic: "Research",
        citations: 469,
        citationSharePercent: 72.27,
      },
    ]);
  });

  it("rejects an unparseable citation share", () => {
    const csv = [
      '"Grounding Query","Intent","Topic","Citations","Citation Share"',
      '"q","Navigational","Research","1","n/a"',
    ].join("\n");
    expect(() => parseQueriesCsv(csv)).toThrow(AppError);
  });
});

function snapshot(
  overrides: Partial<BingAiCitationSnapshot>,
): BingAiCitationSnapshot {
  return {
    id: "s1",
    projectId: "p1",
    organizationId: "org1",
    reportType: "pages" as const,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    rowCount: 1,
    uploadedByUserId: "u1",
    createdAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveSnapshot", () => {
  it("returns the newest snapshot when no id is given", () => {
    const newest = snapshot({ id: "s2" });
    const older = snapshot({ id: "s1" });
    expect(resolveSnapshot([newest, older], null)).toBe(newest);
  });

  it("returns the matching snapshot by id", () => {
    const newest = snapshot({ id: "s2" });
    const older = snapshot({ id: "s1" });
    expect(resolveSnapshot([newest, older], "s1")).toBe(older);
  });

  it("returns null when nothing matches", () => {
    expect(resolveSnapshot([snapshot({})], "missing")).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(resolveSnapshot([], null)).toBeNull();
  });
});
