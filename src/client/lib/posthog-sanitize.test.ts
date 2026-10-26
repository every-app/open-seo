import { describe, expect, it } from "vitest";
import {
  sanitizePostHogEvent,
  sanitizePostHogUrl,
} from "@/client/lib/posthog-sanitize";

describe("sanitizePostHogUrl", () => {
  it("drops content query params and keeps allowlisted ones", () => {
    expect(
      sanitizePostHogUrl(
        "https://app.example.test/p/abc/keywords?q=running+shoes&utm_source=newsletter#row",
      ),
    ).toBe("https://app.example.test/p/abc/keywords?utm_source=newsletter");
    expect(sanitizePostHogUrl("/p/abc/domain?domain=acme.test&tab=pages")).toBe(
      "/p/abc/domain?tab=pages",
    );
  });
});

describe("sanitizePostHogEvent", () => {
  it("sanitizes event and person URLs and removes autocaptured link targets", () => {
    const url = "https://app.example.test/oauth-consent?state=secret";
    expect(
      sanitizePostHogEvent({
        properties: {
          $current_url: url,
          $external_click_url: "https://customer.test/page",
          $elements_chain:
            'a:attr__href="https://customer.test/page"nth-child="1"',
        },
        $set_once: { $initial_current_url: url },
      }),
    ).toEqual({
      properties: {
        $current_url: "https://app.example.test/oauth-consent",
        $elements_chain: 'a:nth-child="1"',
      },
      $set_once: {
        $initial_current_url: "https://app.example.test/oauth-consent",
      },
    });
  });

  it("sanitizes URLs nested in web vitals and used as heatmap keys", () => {
    const { properties } = sanitizePostHogEvent({
      properties: {
        $web_vitals_LCP_event: {
          $current_url: "https://app.example.test/p/abc?q=running+shoes",
        },
        $heatmap_data: {
          "https://app.example.test/p/abc?domain=acme.test&tab=x": [{ x: 1 }],
          "https://app.example.test/p/abc?domain=other.test&tab=x": [{ x: 2 }],
        },
      },
    });
    expect(properties).toEqual({
      $web_vitals_LCP_event: { $current_url: "https://app.example.test/p/abc" },
      $heatmap_data: {
        "https://app.example.test/p/abc?tab=x": [{ x: 1 }, { x: 2 }],
      },
    });
  });

  it("drops exception messages but keeps bare error codes", () => {
    const { properties } = sanitizePostHogEvent({
      properties: {
        $exception_list: [
          { type: "SyntaxError", value: `"running shoes" is not valid JSON` },
          { type: "Error", value: "PAYMENT_REQUIRED" },
        ],
      },
    });
    expect(properties.$exception_list).toEqual([
      { type: "SyntaxError", value: "" },
      { type: "Error", value: "PAYMENT_REQUIRED" },
    ]);
  });
});
