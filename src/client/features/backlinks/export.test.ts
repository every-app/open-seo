import { describe, expect, it } from "vitest";
import { buildBacklinksTabCsvFile } from "./export";

describe("buildBacklinksTabCsvFile", () => {
  it("builds backlinks csv with backlink-specific columns", () => {
    const file = buildBacklinksTabCsvFile({
      tab: "backlinks",
      target: "https://Example.com/path?q=1",
      rows: {
        backlinks: [
          {
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
          },
        ],
        referringDomains: [],
        topPages: [],
      },
    });

    expect(file.filename).toBe("backlinks-backlinks-example.com-path-q-1.csv");
    expect(file.content).toContain('"Domain","Source URL","Target URL"');
    expect(file.content).toContain('"example.org"');
    expect(file.content).toContain('"noopener, noreferrer"');
  });

  it("builds referring domains csv", () => {
    const file = buildBacklinksTabCsvFile({
      tab: "domains",
      target: "Example.com",
      rows: {
        backlinks: [],
        referringDomains: [
          {
            domain: "source.com",
            backlinks: 12,
            referringPages: 7,
            rank: 101,
            spamScore: 4,
            firstSeen: "2024-05-10",
            brokenBacklinks: 1,
            brokenPages: 0,
          },
        ],
        topPages: [],
      },
    });

    expect(file.filename).toBe("backlinks-referring-domains-example.com.csv");
    expect(file.content).toContain('"Domain","Backlinks","Referring Pages"');
    expect(file.content).toContain('"source.com"');
  });

  it("builds top pages csv", () => {
    const file = buildBacklinksTabCsvFile({
      tab: "pages",
      target: "docs.example.com",
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

    expect(file.filename).toBe("backlinks-top-pages-docs.example.com.csv");
    expect(file.content).toContain(
      '"Page","Backlinks","Referring Domains","Rank","Broken Backlinks"',
    );
    expect(file.content).toContain('"https://docs.example.com/start"');
  });
  it("sanitizes formula-like cell values to prevent CSV injection", () => {
    const file = buildBacklinksTabCsvFile({
      tab: "backlinks",
      target: "example.com",
      rows: {
        backlinks: [
          {
            domainFrom: "=cmd|' /C calc'!A0",
            urlFrom: "+https://evil.example/source",
            urlTo: "@https://evil.example/target",
            anchor: "\tformula",
            itemType: "organic",
            isDofollow: true,
            relAttributes: [],
            rank: 1,
            domainFromRank: 1,
            pageFromRank: 1,
            spamScore: 0,
            firstSeen: "2025-01-01",
            lastSeen: "2025-01-01",
            isLost: false,
            isBroken: false,
            linksCount: 1,
          },
        ],
        referringDomains: [],
        topPages: [],
      },
    });

    expect(file.content).toContain("\"'=cmd|' /C calc'!A0\"");
    expect(file.content).toContain('"\'+https://evil.example/source"');
    expect(file.content).toContain('"\'@https://evil.example/target"');
    expect(file.content).toContain('"\'\tformula"');
  });
});
