import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoogleAdsAvailabilityNotice } from "./GoogleAdsAvailabilityNotice";

describe("GoogleAdsAvailabilityNotice", () => {
  it("shows unsupported KD and intent as not_available", () => {
    const markup = renderToStaticMarkup(
      createElement(GoogleAdsAvailabilityNotice),
    );

    expect(markup).toContain("KD");
    expect(markup).toContain("intent");
    expect(markup.match(/not_available/g)).toHaveLength(2);
  });
});
