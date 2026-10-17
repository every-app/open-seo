import { describe, it, expect } from "vitest";
import { getTranslation, DEFAULT_LOCALE } from "./i18n";
import { getIssueDescriptor } from "@/shared/audit-issues";

describe("i18n client infrastructure", () => {
  it("defaults to German", () => {
    expect(DEFAULT_LOCALE).toBe("de");
    expect(getTranslation("nav.dashboard", "de")).toBe("Dashboard");
    expect(getTranslation("nav.keywords", "de")).toBe("Keyword-Recherche");
    expect(getTranslation("nav.audit", "de")).toBe("Site-Audit");
    expect(getTranslation("audit.critical", "de")).toBe("Kritisch");
  });

  it("translates English when requested", () => {
    expect(getTranslation("nav.keywords", "en")).toBe("Keyword Research");
    expect(getTranslation("audit.critical", "en")).toBe("Critical");
  });

  it("interpolates parameters", () => {
    const interpolated = getTranslation("audit.pages_crawled", "de");
    expect(interpolated).toBe("Seiten gecrawlt");
  });

  it("provides localized audit issue descriptors", () => {
    const enIssue = getIssueDescriptor("broken-internal-link", "en");
    const deIssue = getIssueDescriptor("broken-internal-link", "de");

    expect(enIssue?.title).toBe("Broken internal link");
    expect(deIssue?.title).toBe("Fehlerhafter interner Link");
    expect(deIssue?.explanation).toContain("Fehlerstatus (4xx/5xx)");
    expect(deIssue?.howToFix).toContain("Aktualisiere den Link");
  });
});
