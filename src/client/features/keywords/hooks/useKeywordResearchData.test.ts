import { describe, expect, it, vi } from "vitest";

// The hook module pulls in the server functions it calls, whose graph reaches
// Workers-only bindings that don't resolve outside workerd.
vi.mock("cloudflare:workers", () => ({ env: {} }));

import { buildKeywordResearchRequest } from "./useKeywordResearchData";

const baseInput = {
  projectId: "project_1",
  keywordInput: "technical seo",
  locationCode: 2704,
  resultLimit: 150 as const,
  mode: "auto" as const,
  clickstream: false,
};

describe("buildKeywordResearchRequest", () => {
  it("carries an explicitly selected location without a language", () => {
    const request = buildKeywordResearchRequest(baseInput);

    expect(request).toMatchObject({ locationCode: 2704 });
    expect(request).not.toHaveProperty("languageCode");
  });

  it("leaves the location undefined for the server to resolve", () => {
    const request = buildKeywordResearchRequest({
      ...baseInput,
      locationCode: undefined,
    });

    expect(request).toMatchObject({ locationCode: undefined });
    expect(request).not.toHaveProperty("languageCode");
  });
});
