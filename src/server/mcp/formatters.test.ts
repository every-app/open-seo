import { describe, expect, it } from "vitest";
import { mcpResponse, MCP_TEXT_CHAR_BUDGET } from "./formatters";
import { formatMcpTable } from "./table";

describe("mcpResponse", () => {
  it("caps a single oversized row including the notice and preserves its data", () => {
    const rows = [{ value: "x".repeat(MCP_TEXT_CHAR_BUDGET * 2) }];
    const result = mcpResponse({
      text: formatMcpTable(rows, [
        { header: "value", value: (row) => row.value },
      ]),
      structuredContent: { rows },
    });
    const text = result.content[0];
    expect(text.type).toBe("text");
    if (text.type !== "text") throw new Error("Expected text");
    expect(text.text).toHaveLength(MCP_TEXT_CHAR_BUDGET);
    expect(text.text).toContain("Text truncated");
    expect(text.text).toContain("structuredContent payload is unchanged");
    expect(result.structuredContent.rows).toBe(rows);
  });

  it("does not promise structured data when truncating a text-only result", () => {
    const result = mcpResponse({ text: "x".repeat(MCP_TEXT_CHAR_BUDGET + 1) });
    const text = result.content[0];
    if (text.type !== "text") throw new Error("Expected text");
    expect(text.text).toHaveLength(MCP_TEXT_CHAR_BUDGET);
    expect(text.text).not.toContain("structuredContent");
    expect(result.structuredContent).toBeUndefined();
  });

  it("drops undefined meta keys and omits _meta when nothing is left", () => {
    const result = mcpResponse({
      text: "hi",
      meta: {
        url: "https://app.openseo.so",
        creditsCharged: 0,
        projectId: undefined,
      },
    });
    expect(result._meta).toEqual({
      url: "https://app.openseo.so",
      creditsCharged: 0,
    });

    expect(mcpResponse({ text: "hi" })._meta).toBeUndefined();
    const allUndefined = mcpResponse({
      text: "hi",
      meta: { projectId: undefined },
    });
    expect(allUndefined._meta).toBeUndefined();
    expect(allUndefined.structuredContent).toBeUndefined();
  });

  it("mirrors metadata into structuredContent for clients that hide _meta", () => {
    const meta = { url: "https://app.openseo.so/p/1", creditsRemaining: 100 };

    const withPayload = mcpResponse({
      text: "hi",
      meta,
      structuredContent: { foo: "bar" },
    });
    expect(withPayload.structuredContent).toEqual({ foo: "bar", meta });
    expect(withPayload._meta).toEqual(meta);

    const metaOnly = mcpResponse({ text: "hi", meta });
    expect(metaOnly.structuredContent).toEqual({ meta });
  });
});
