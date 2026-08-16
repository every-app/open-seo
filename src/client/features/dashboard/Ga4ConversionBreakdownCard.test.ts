import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConversionBreakdownCard } from "./Ga4DashboardCards";

vi.mock("@/serverFunctions/ga4", () => ({
  getDashboardGa4Summary: vi.fn(),
}));

function renderCard(
  input: Partial<Parameters<typeof ConversionBreakdownCard>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(ConversionBreakdownCard, {
      events: [],
      eventTypeCount: 0,
      limited: false,
      ...input,
    }),
  );
}

describe("ConversionBreakdownCard", () => {
  it("keeps long friendly and exact event names visible", () => {
    const eventName =
      "form_submit_contact_request_from_google_ads_campaign_landing_page";
    const markup = renderCard({
      events: [{ eventName, keyEvents: 12, users: 7 }],
      eventTypeCount: 1,
    });

    expect(markup).toContain(
      "Contact Request From Google Ads Campaign Landing Page form submission",
    );
    expect(markup).toContain(eventName);
    expect(markup).toContain("break-words");
    expect(markup).toContain("break-all");
    expect(markup).not.toContain("truncate");
  });

  it("does not treat a limited empty report as zero conversions", () => {
    const markup = renderCard({ limited: true });

    expect(markup).toContain(
      "Google Analytics did not return a complete key-event breakdown",
    );
    expect(markup).not.toContain("No key events were recorded");
  });

  it("uses the true-zero copy for a complete empty report", () => {
    const markup = renderCard();

    expect(markup).toContain("No key events were recorded for this period.");
  });

  it("avoids an exact total when Google truncates the breakdown", () => {
    const markup = renderCard({
      events: [{ eventName: "purchase", keyEvents: 3, users: 2 }],
      eventTypeCount: null,
      limited: true,
    });

    expect(markup).toContain("more active conversion types exist");
    expect(markup).not.toContain("of 1 active conversion types");
  });
});
