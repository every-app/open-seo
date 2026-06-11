import { describe, expect, it } from "vitest";
import { buildCsv } from "@/client/lib/csv";
import type { BacklinksRow, ReferringDomainRow } from "./backlinksPageTypes";
import {
  buildBacklinksTabCsvFilename,
  buildBacklinksTabExport,
} from "./export";

function makeBacklinkRow(overrides: Partial<BacklinksRow> = {}): BacklinksRow {
  return {
    domainFrom: "example.org",
    urlFrom: "https://example.org/post",
    urlTo: "https://example.com/path",
    anchor: "Example",
    itemType: "organic",
    isDofollow: true,
    relAttributes: ["noopener", "noreferrer"],
    rank: 123,
    domainFromRank: 45,
    pageFromRank: 12,
    spamScore: 10,
    firstSeen: "2025-01-01",
    lastSeen: "2025-01-15",
    isLost: false,
    isBroken: false,
    linksCount: 2,
    ...overrides,
  };
}

function makeReferringDomainRow(
  overrides: Partial<ReferringDomainRow> = {},
): ReferringDomainRow {
  return {
    domain: "source.com",
    backlinks: 12,
    referringPages: 7,
    rank: 101,
    spamScore: 4,
    firstSeen: "2024-05-10",
    brokenBacklinks: 1,
    brokenPages: 0,
    ...overrides,
  };
}

function buildTabCsv(
  ...args: Parameters<typeof buildBacklinksTabExport>
): string {
  const { headers, rows } = buildBacklinksTabExport(...args);
  return buildCsv(headers, rows);
}

describe("buildBacklinksTabCsvFilename", () => {
  it("normalizes the target into the filename per tab", () => {
    expect(
      buildBacklinksTabCsvFilename("backlinks", "https://Example.com/path?q=1"),
    ).toBe("backlinks-backlinks-example.com-path-q-1.csv");
    expect(buildBacklinksTabCsvFilename("domains", "Example.com")).toBe(
      "backlinks-referring-domains-example.com.csv",
    );
    expect(buildBacklinksTabCsvFilename("pages", "docs.example.com")).toBe(
      "backlinks-top-pages-docs.example.com.csv",
    );
  });
});

describe("buildBacklinksTabExport", () => {
  it("builds backlinks csv with backlink-specific columns", () => {
    const content = buildTabCsv({
      tab: "backlinks",
      rows: {
        backlinks: [makeBacklinkRow()],
        referringDomains: [],
        topPages: [],
      },
    });

    expect(content).toContain('"Domain","Source URL","Target URL"');
    expect(content).not.toContain('"Ahrefs DR"');
    expect(content).toContain('"example.org"');
    expect(content).toContain('"noopener, noreferrer"');
  });

  it("includes an Ahrefs DR column when ratings are loaded", () => {
    const content = buildTabCsv({
      tab: "domains",
      domainRatings: { "source.com": 71.5, "other.com": null },
      rows: {
        backlinks: [],
        referringDomains: [makeReferringDomainRow()],
        topPages: [],
      },
    });

    expect(content).toContain('"Rank","Ahrefs DR","Spam Score"');
    expect(content).toContain('"71.5"');
  });

  it("keys backlink Ahrefs DR off the www-stripped source domain", () => {
    const content = buildTabCsv({
      tab: "backlinks",
      domainRatings: { "example.org": 33 },
      rows: {
        backlinks: [makeBacklinkRow({ domainFrom: "www.example.org" })],
        referringDomains: [],
        topPages: [],
      },
    });

    expect(content).toContain('"Domain Rank","Ahrefs DR","Source Page Rank"');
    expect(content).toContain('"33"');
  });

  it("builds referring domains csv", () => {
    const content = buildTabCsv({
      tab: "domains",
      rows: {
        backlinks: [],
        referringDomains: [makeReferringDomainRow()],
        topPages: [],
      },
    });

    expect(content).toContain('"Domain","Backlinks","Referring Pages"');
    expect(content).toContain('"source.com"');
  });

  it("builds top pages csv", () => {
    const content = buildTabCsv({
      tab: "pages",
      rows: {
        backlinks: [],
        referringDomains: [],
        topPages: [
          {
            page: "https://docs.example.com/start",
            backlinks: 22,
            referringDomains: 9,
            rank: 88,
            brokenBacklinks: 0,
          },
        ],
      },
    });

    expect(content).toContain(
      '"Page","Backlinks","Referring Domains","Rank","Broken Backlinks"',
    );
    expect(content).toContain('"https://docs.example.com/start"');
  });

  it("sanitizes formula-like cell values to prevent CSV injection", () => {
    const content = buildTabCsv({
      tab: "backlinks",
      rows: {
        backlinks: [
          makeBacklinkRow({
            domainFrom: "=cmd|' /C calc'!A0",
            urlFrom: "+https://evil.example/source",
            urlTo: "@https://evil.example/target",
            anchor: "\tformula",
            relAttributes: [],
            linksCount: 1,
          }),
        ],
        referringDomains: [],
        topPages: [],
      },
    });

    expect(content).toContain("\"'=cmd|' /C calc'!A0\"");
    expect(content).toContain('"\'+https://evil.example/source"');
    expect(content).toContain('"\'@https://evil.example/target"');
    expect(content).toContain('"\'\tformula"');
  });
});
