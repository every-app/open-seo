import { describe, expect, it } from "vitest";
import { z } from "zod";
import { capToolOutput } from "./samToolOutput";

const row = (i: number) => ({ keyword: `keyword ${i}`, volume: i * 10 });

const capped = z.object({ truncated: z.string() }).loose();

describe("capToolOutput", () => {
  it("halves the largest array until the result fits and says so", () => {
    const rows = Array.from({ length: 800 }, (_, i) => row(i));
    const value = { summary: "800 keywords", data: { rows } };

    const out = capped
      .extend({ data: z.object({ rows: z.array(z.unknown()) }) })
      .parse(capToolOutput(value, 8_000));

    expect(JSON.stringify(out).length).toBeLessThanOrEqual(8_000);
    expect(out.data.rows[0]).toEqual(row(0));
    expect(out.truncated).toBe(
      `Output trimmed to fit the chat context: \`data.rows\` shows ${out.data.rows.length} of 800 rows. Narrow the request (filters, a smaller limit, fewer pages) to see the rest.`,
    );
    expect(value.data.rows).toHaveLength(800);
  });

  it("shortens long strings when there is no array to trim", () => {
    const value = {
      pages: [{ url: "https://a.test", text: "x".repeat(20_000) }],
    };

    const out = capped.parse(capToolOutput(value, 3_000));

    expect(JSON.stringify(out).length).toBeLessThanOrEqual(3_000);
    expect(out.truncated).toContain("`pages[*].text` shortened to");
  });

  it("keeps the note inside the cap and names each shape once", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: i,
      body: "z".repeat(9_000),
    }));

    const out = capped.parse(capToolOutput({ data: { rows } }, 32_000));

    expect(JSON.stringify(out).length).toBeLessThanOrEqual(32_000);
    expect(out.truncated.match(/`data\.rows\[\*\]\.body`/g)).toHaveLength(1);
    expect(out.truncated).toContain("`data.rows` shows");
  });
});
