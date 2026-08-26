import { describe, expect, it } from "vitest";
import { formatCountryLabel } from "./platformLabels";
import {
  WEB_SEARCH_COUNTRY_CODES,
  webSearchCountryCodeSchema,
} from "@/types/schemas/ai-search";

describe("Prompt Explorer country labels", () => {
  it("supports Türkiye for localized web search", () => {
    expect(WEB_SEARCH_COUNTRY_CODES).toContain("TR");
    const countryCode = webSearchCountryCodeSchema.parse("TR");
    expect(formatCountryLabel(countryCode)).toBe("Türkiye");
  });
});
