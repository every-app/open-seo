import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { copyTableToClipboard } from "./clipboard";

type WrittenItem = {
  plain: string;
  html: string;
};

class FakeClipboardItem {
  constructor(public types: Record<string, Promise<Blob> | Blob>) {}
  async getType(type: string): Promise<Blob> {
    return await this.types[type];
  }
}

function mockClipboard() {
  vi.stubGlobal("ClipboardItem", FakeClipboardItem);
  const written: WrittenItem[] = [];
  const writeMock = vi.fn(async (items: FakeClipboardItem[]) => {
    for (const item of items) {
      const plainBlob = await item.getType("text/plain");
      const htmlBlob = await item.getType("text/html");
      written.push({
        plain: await plainBlob.text(),
        html: await htmlBlob.text(),
      });
    }
  });
  vi.stubGlobal("navigator", { clipboard: { write: writeMock } });
  return { written, writeMock };
}

describe("copyTableToClipboard", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("emits TSV with tab/newline separators and flattens them inside cells", async () => {
    const { written } = mockClipboard();
    await copyTableToClipboard(
      ["Keyword", "Volume"],
      [
        ["seo audit", 1200],
        ["one\ttwo\nthree", 800],
      ],
    );
    expect(written[0].plain).toBe(
      "Keyword\tVolume\nseo audit\t1200\none two three\t800",
    );
  });

  it("emits URL cells as HTML links for spreadsheet paste", async () => {
    const { written } = mockClipboard();
    await copyTableToClipboard(["URL"], [["https://example.com/tools"]]);
    expect(written[0].plain).toBe("URL\nhttps://example.com/tools");
    expect(written[0].html).toContain(
      '<td><a href="https://example.com/tools">https://example.com/tools</a></td>',
    );
  });

  it("sanitizes formula-injection cells with a leading apostrophe", async () => {
    const { written } = mockClipboard();
    await copyTableToClipboard(["Keyword"], [['=HYPERLINK("evil")']]);
    // OWASP guard prefixes the cell with `'` so Sheets/Excel treat it as text.
    expect(written[0].plain).toContain("'=HYPERLINK");
    expect(written[0].html).toMatch(/<td>'=HYPERLINK/);
  });

  it("escapes HTML special characters in string cells", async () => {
    const { written } = mockClipboard();
    await copyTableToClipboard(["Title"], [['<script>alert("x")</script>']]);
    expect(written[0].html).not.toContain("<script>");
    expect(written[0].html).toContain("&lt;script&gt;");
  });
});
