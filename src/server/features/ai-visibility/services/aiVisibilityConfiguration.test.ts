import { describe, expect, it, vi } from "vitest";
import type { AiTrackerPatch } from "@/types/schemas/ai-visibility";
import type { ConfigurationRows } from "../repositories/AiVisibilityRepository";
import { aiScope, projectAiConfiguration } from "./aiVisibilityConfiguration";

function project(
  patch: AiTrackerPatch = {},
  previous: ConfigurationRows | null = null,
) {
  return projectAiConfiguration({
    previous,
    patch,
    projectId: "project",
    projectMarket: { locationCode: 2100, languageCode: "bg" },
    now: "2026-09-05T12:00:00.000Z",
  });
}
const saved = () =>
  project({
    prompts: [
      { text: "Which analytics tool?", topic: "Buying" },
      { text: "How do I measure traffic?" },
    ],
  }).rows;

describe("AI configuration projection", () => {
  it("creates a weekly tracker, first check at least a week out, in the project market with two consumer engines and General prompts", () => {
    // Late in the UTC day, past the scheduler's 04:00–10:00 UTC slots.
    vi.useFakeTimers({ now: new Date("2026-09-05T23:00:00.000Z") });
    const rows = saved();
    vi.useRealTimers();
    expect(rows.tracker.nextCheckAt).toMatch(/^2026-09-13T0/);
    expect(rows.tracker).toMatchObject({
      enabled: true,
      scheduleInterval: "weekly",
      locationCode: 2100,
      languageCode: "bg",
      chatgpt: true,
      gemini: true,
      googleAiOverview: false,
    });
    expect(rows.prompts.map((p) => p.topic)).toEqual(["Buying", "General"]);
  });

  it("keeps answers on their exact text: new wording archives the prompt and adds a new one", () => {
    const before = saved();
    const [edited] = before.prompts;
    const { rows } = project(
      { prompts: [{ id: edited.id, text: "Which analytics suite?" }] },
      before,
    );
    expect(rows.prompts.find((p) => p.id === edited.id)).toMatchObject({
      text: "Which analytics tool?",
      archived: true,
    });
    expect(rows.prompts.at(-1)).toMatchObject({
      text: "Which analytics suite?",
      topic: "Buying",
      archived: false,
    });
    // Previous rows are copied, never mutated.
    expect(before.prompts[0].archived).toBe(false);
  });

  it("moves or pauses a prompt in place when its text is unchanged", () => {
    const before = saved();
    const [prompt] = before.prompts;
    const { rows } = project(
      {
        prompts: [
          { id: prompt.id, text: prompt.text, topic: "Pricing", paused: true },
        ],
      },
      before,
    );
    expect(rows.prompts).toHaveLength(2);
    expect(rows.prompts[0]).toMatchObject({
      id: prompt.id,
      topic: "Pricing",
      paused: true,
    });
  });

  it("restores an archived prompt when its text is added back, so its history continues", () => {
    const before = saved();
    const [prompt] = before.prompts;
    const archived = project({ archivePromptIds: [prompt.id] }, before).rows;
    const { rows, created } = project(
      { prompts: [{ text: prompt.text }] },
      archived,
    );
    expect(created).toBe(1);
    expect(rows.prompts).toHaveLength(2);
    expect(rows.prompts[0]).toMatchObject({ id: prompt.id, archived: false });
  });

  it("skips a new duplicate but rejects an edit into another prompt's text", () => {
    const before = saved();
    expect(
      project({ prompts: [{ text: " Which analytics tool? " }] }, before)
        .skipped,
    ).toBe(1);
    expect(() =>
      project(
        {
          prompts: [
            { id: before.prompts[1].id, text: "Which analytics tool?" },
          ],
        },
        before,
      ),
    ).toThrow(/duplicates/);
  });

  it("allows 100 unarchived prompts in 30 topics and reuses archived capacity", () => {
    const full = project({
      prompts: Array.from({ length: 100 }, (_, i) => ({
        text: `Question ${i}`,
        topic: `Topic ${i % 30}`,
        paused: true,
      })),
    }).rows;
    expect(() => project({ prompts: [{ text: "Overflow" }] }, full)).toThrow(
      /100 unarchived/,
    );
    expect(() =>
      project(
        {
          archivePromptIds: [full.prompts[0].id],
          prompts: [{ text: "New topic question", topic: "Topic 30" }],
        },
        full,
      ),
    ).toThrow(/30 topics/);
    expect(
      project(
        {
          archivePromptIds: [full.prompts[0].id],
          prompts: [{ text: "Replacement", topic: "Topic 1" }],
        },
        full,
      ).rows.prompts.filter((p) => !p.archived),
    ).toHaveLength(100);
  });
});

describe("AI check scope", () => {
  it("collects active prompts on every engine and refuses inactive selections", () => {
    const before = saved();
    const [active, paused] = before.prompts;
    const rows = project(
      { prompts: [{ id: paused.id, text: paused.text, paused: true }] },
      before,
    ).rows;
    expect(aiScope(rows)).toMatchObject({
      prompts: [{ id: active.id }],
      engines: ["chatgpt", "gemini"],
    });
    expect(() => aiScope(rows, [paused.id])).toThrow(/active prompt IDs/);
  });
});
