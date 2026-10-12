import { describe, expect, it } from "vitest";
import type { AiTrackerPatch } from "@/types/schemas/ai-visibility";
import type { ConfigurationRows } from "../repositories/AiVisibilityRepository";
import { projectAiConfiguration } from "./aiVisibilityConfiguration";

const US = { locationCode: 2840, languageCode: "en" };
function project(
  patch: AiTrackerPatch = {},
  previous: ConfigurationRows | null = null,
  projectMarket = US,
) {
  return projectAiConfiguration({
    previous,
    patch,
    projectId: "00000000-0000-4000-8000-000000000001",
    projectMarket,
    now: "2026-09-05T12:00:00.000Z",
  });
}

describe("AI tracker market", () => {
  it("snaps the language to a changed country unless one is given", () => {
    const before = project().rows;
    expect(project({ locationCode: 2100 }, before).rows.tracker).toMatchObject({
      locationCode: 2100,
      languageCode: "bg",
    });
    expect(
      project({ locationCode: 2124, languageCode: "fr" }, before).rows.tracker,
    ).toMatchObject({ locationCode: 2124, languageCode: "fr" });
  });
  it("rejects markets the selected engines cannot collect in", () => {
    expect(() => project({ locationCode: 2100, languageCode: "en" })).toThrow(
      /Bulgaria supports languageCode bg/,
    );
    expect(() => project({ locationCode: 2275 })).toThrow(
      /ChatGPT cannot collect answers in Palestine/,
    );
    expect(() =>
      project(
        { engines: ["chatgpt"] },
        project({ engines: ["gemini"], locationCode: 2275 }).rows,
      ),
    ).toThrow(/ChatGPT cannot collect answers in Palestine/);
  });
  it("starts in the US when the project market is not collectable and none was chosen", () => {
    const palestine = { locationCode: 2275, languageCode: "ar" };
    expect(project({}, null, palestine).rows.tracker).toMatchObject(US);
    expect(
      project({ engines: ["gemini"] }, null, palestine).rows.tracker,
    ).toMatchObject(palestine);
  });
});
