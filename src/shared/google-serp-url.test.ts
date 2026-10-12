import { describe, expect, it } from "vitest";
import { googleSerpUrl } from "./google-serp-url";

describe("googleSerpUrl", () => {
  it("targets the tracked city with uule", () => {
    expect(
      googleSerpUrl("best seo tool", {
        locationCode: 2840,
        languageCode: "en",
        locationName: "Austin,Texas,United States",
      }),
    ).toBe(
      "https://www.google.com/search?q=best+seo+tool&hl=en&gl=us&pws=0&uule=w+CAIQICIaQXVzdGluLFRleGFzLFVuaXRlZCBTdGF0ZXM%3D",
    );
  });

  it("uses only the country for a national tracker", () => {
    expect(
      googleSerpUrl("café", { locationCode: 2826, languageCode: "en" }),
    ).toBe("https://www.google.com/search?q=caf%C3%A9&hl=en&gl=gb&pws=0");
  });
});
