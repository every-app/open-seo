import { describe, expect, it } from "vitest";
import {
  aiResultsSchema,
  aiSourcesSchema,
  aiTrackerPatchSchema,
} from "./ai-visibility";

describe("AI tracker input boundary", () => {
  it("rejects malformed IDs, empty engines and excessive bulk edits", () => {
    for (const patch of [
      { prompts: [{ id: "foreign", text: "x" }] },
      { engines: [] },
      { prompts: Array.from({ length: 101 }, () => ({ text: "x" })) },
    ]) {
      expect(aiTrackerPatchSchema.safeParse(patch).success).toBe(false);
    }
  });
  it("enforces the provider prompt ceiling without silently truncating exact input", () => {
    const maximum = "x".repeat(2000);
    expect(
      aiTrackerPatchSchema.parse({ prompts: [{ text: maximum }] }).prompts?.[0]
        .text,
    ).toBe(maximum);
    expect(
      aiTrackerPatchSchema.safeParse({ prompts: [{ text: `${maximum}x` }] })
        .success,
    ).toBe(false);
    expect(
      aiTrackerPatchSchema.safeParse({ prompts: [{ text: "  " }] }).success,
    ).toBe(false);
  });
});

describe("AI review query filters", () => {
  const projectId = "00000000-0000-4000-8000-000000000001";
  const filters = {
    runId: null,
    topic: null,
    engines: null,
    promptId: null,
    cursor: null,
  };
  it("accepts explicit null filters for run-wide result and source reads", () => {
    expect(aiResultsSchema.parse({ projectId, ...filters })).toMatchObject(
      filters,
    );
    expect(aiSourcesSchema.parse({ projectId, ...filters })).toMatchObject(
      filters,
    );
  });
  it("keeps real filters intact and rejects invalid engine/ID/cursor sentinels", () => {
    const scoped = {
      projectId,
      topic: "all",
      engines: ["chatgpt", "gemini"],
      promptId: projectId,
      cursor: "25",
    };
    expect(aiResultsSchema.parse(scoped)).toMatchObject(scoped);
    for (const patch of [
      { engines: ["all"] },
      { promptId: "all" },
      { runId: "all" },
      { cursor: "all" },
    ])
      expect(aiResultsSchema.safeParse({ projectId, ...patch }).success).toBe(
        false,
      );
  });
});
