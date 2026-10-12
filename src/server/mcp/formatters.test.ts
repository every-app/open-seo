import { describe, expect, it } from "vitest";
import { mcpResponse } from "./formatters";

describe("mcpResponse", () => {
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
