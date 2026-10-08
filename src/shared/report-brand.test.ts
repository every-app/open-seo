import { describe, expect, it } from "vitest";
import { applyReportBrand, type ReportBrand } from "./report-brand";

const brand = (overrides: Partial<ReportBrand> = {}): ReportBrand => ({
  brandColor: "#ff5700",
  brandColor2: null,
  accentColor: null,
  canvasColor: null,
  logoDataUri: null,
  ...overrides,
});

const html =
  "<!doctype html><html><head><style>:root{--brand:#141414}</style></head><body></body></html>";

describe("applyReportBrand", () => {
  it("replaces the block from an earlier save instead of stacking a second", () => {
    const once = applyReportBrand(html, brand());
    const twice = applyReportBrand(once, brand({ brandColor: "#1c4ed8" }));

    expect(twice.match(/id="openseo-brand"/g)).toHaveLength(1);
    // Last in the head, so it overrides the starter's :root defaults.
    expect(twice).toContain(
      '<style id="openseo-brand">:root{--brand:#1c4ed8}</style></head>',
    );
  });
});
