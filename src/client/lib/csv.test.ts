import { describe, expect, it } from "vitest";
import { buildCsv } from "./csv";

describe("buildCsv", () => {
  it("rounds decimal numbers to at most two places", () => {
    const csv = buildCsv(
      ["Page", "Traffic", "Keywords"],
      [["/tools", 1250.321954, 4]],
    );

    expect(csv).toContain('"1250.32"');
    expect(csv).toContain('"4"');
  });

  it("keeps formula-injection protection for string cells", () => {
    const csv = buildCsv(
      ["Value"],
      [['=HYPERLINK("evil")'], ["+1"], ["@SUM(A1)"], ["\tformula"]],
    );

    expect(csv).toContain('"\'=HYPERLINK(""evil"")"');
    expect(csv).toContain('"\'+1"');
    expect(csv).toContain('"\'@SUM(A1)"');
    expect(csv).toContain('"\'\tformula"');
  });
});
