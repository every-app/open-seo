import { describe, expect, it } from "vitest";
import { createProjectSchema, updateProjectSchema } from "./projects";

// The service derives a missing language from the location, so a language
// arriving on its own has nothing to validate against.
describe("project market fields", () => {
  it.each([
    [{}, true],
    [{ locationCode: 2704 }, true],
    [{ locationCode: 2704, languageCode: "vi" }, true],
    [{ languageCode: "vi" }, false],
  ])("market %j is accepted: %s", (market, success) => {
    expect(
      createProjectSchema.safeParse({ name: "Acme", ...market }).success,
    ).toBe(success);
    expect(
      updateProjectSchema.safeParse({
        projectId: "project_1",
        name: "Acme",
        ...market,
      }).success,
    ).toBe(success);
  });
});
