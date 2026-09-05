import { describe, expect, it } from "vitest";
import { sanitizeTranscript } from "./samTranscript";

const textPart = (text: string) => ({ type: "text", text });
const userMessage = (id: string, parts: unknown[] = [textPart("hello")]) => ({
  id,
  role: "user",
  parts,
});
const assistantMessage = (
  id: string,
  parts: unknown[] = [textPart("hi there")],
) => ({ id, role: "assistant", parts });

describe("sanitizeTranscript", () => {
  it("returns the same reference for a clean transcript", () => {
    const clean = [userMessage("1"), assistantMessage("2")];
    expect(sanitizeTranscript(clean)).toBe(clean);
  });

  it("returns an empty array for non-array input", () => {
    expect(sanitizeTranscript(undefined)).toEqual([]);
    expect(sanitizeTranscript(null)).toEqual([]);
    expect(sanitizeTranscript({})).toEqual([]);
  });

  it("drops null and undefined messages", () => {
    const input = [userMessage("1"), null, undefined, assistantMessage("2")];
    expect(sanitizeTranscript(input)).toEqual([
      userMessage("1"),
      assistantMessage("2"),
    ]);
  });

  it("drops messages without a string role", () => {
    const input = [{ id: "1", parts: [] }, userMessage("2")];
    expect(sanitizeTranscript(input)).toEqual([userMessage("2")]);
  });

  it("drops null, undefined, and typeless parts", () => {
    const input = [
      assistantMessage("1", [
        textPart("a"),
        null,
        undefined,
        { text: "no type" },
        42,
        textPart("b"),
      ]),
    ];
    expect(sanitizeTranscript(input)).toEqual([
      assistantMessage("1", [textPart("a"), textPart("b")]),
    ]);
  });

  it("gives a message without a parts array an empty one", () => {
    const input = [{ id: "1", role: "assistant" }];
    expect(sanitizeTranscript(input)).toEqual([
      { id: "1", role: "assistant", parts: [] },
    ]);
  });

  it("replaces a non-array parts value with an empty array", () => {
    const input = [{ id: "1", role: "user", parts: "corrupt" }];
    expect(sanitizeTranscript(input)).toEqual([
      { id: "1", role: "user", parts: [] },
    ]);
  });

  it("keeps messages before and after a corrupted one intact", () => {
    const before = userMessage("1");
    const corrupt = assistantMessage("2", [null, undefined]);
    const after = assistantMessage("3");
    const input = [before, corrupt, after];
    expect(sanitizeTranscript(input)).toEqual([
      before,
      assistantMessage("2", []),
      after,
    ]);
  });

  it("does not mutate the input", () => {
    const bad = [userMessage("1", [textPart("a"), null])];
    const snapshot = JSON.stringify(bad);
    sanitizeTranscript(bad);
    expect(JSON.stringify(bad)).toBe(snapshot);
  });
});
