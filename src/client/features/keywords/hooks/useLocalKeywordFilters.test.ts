import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS } from "@/client/features/keywords/keywordResearchTypes";
import { filterValuesSchema } from "./useLocalKeywordFilters";

describe("filterValuesSchema — persistence migration", () => {
  it("defaults intents to '' for blobs persisted before the intent filter existed", () => {
    // A filter blob saved by an older build has no `intents` key.
    const legacyBlob = {
      include: "shoes",
      exclude: "",
      minVol: "100",
      maxVol: "",
      minCpc: "",
      maxCpc: "",
      minKd: "",
      maxKd: "",
    };

    const parsed = filterValuesSchema.parse(legacyBlob);

    expect(parsed.intents).toBe("");
    // The rest of the user's saved filters survive the migration.
    expect(parsed.include).toBe("shoes");
    expect(parsed.minVol).toBe("100");
  });

  it("preserves a stored intents value", () => {
    const parsed = filterValuesSchema.parse({
      ...EMPTY_FILTERS,
      intents: "transactional,commercial",
    });

    expect(parsed.intents).toBe("transactional,commercial");
  });
});
