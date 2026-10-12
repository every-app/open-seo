import { describe, expect, it, vi } from "vitest";

// The hook module pulls in the server functions it calls, whose graph reaches
// Workers-only bindings that don't resolve outside workerd.
vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  buildKeywordResearchRequest,
  buildKeywordResearchQueryKey,
} from "./useKeywordResearchData";

const baseInput = {
  projectId: "project_1",
  keywordInput: "technical seo",
  locationCode: 2704,
  locationName: undefined,
  resultLimit: 150 as const,
  mode: "auto" as const,
  clickstream: false,
  groupKeywords: false,
};

describe("buildKeywordResearchRequest", () => {
  it("never serves a national or ungrouped result for a local or grouped search", () => {
    const national = buildKeywordResearchRequest(baseInput);
    const local = buildKeywordResearchRequest({
      ...baseInput,
      locationName: "Hanoi,Hanoi,Vietnam",
    });
    const grouped = buildKeywordResearchRequest({
      ...baseInput,
      groupKeywords: true,
    });

    expect(local).toMatchObject({ locationName: "Hanoi,Hanoi,Vietnam" });
    expect(buildKeywordResearchQueryKey(local)).not.toEqual(
      buildKeywordResearchQueryKey(national),
    );
    expect(buildKeywordResearchQueryKey(grouped)).not.toEqual(
      buildKeywordResearchQueryKey(national),
    );
  });
});
