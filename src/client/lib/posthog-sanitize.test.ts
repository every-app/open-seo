import { describe, expect, it } from "vitest";
import {
  sanitizePostHogProperties,
  sanitizePostHogUrl,
} from "@/client/lib/posthog-sanitize";

const consentUrl =
  "https://app.example.test/oauth-consent?state=state-secret&future_parameter=future-secret";

describe("sanitizePostHogUrl", () => {
  it("removes the complete query from OAuth consent URLs, including on event and session properties", () => {
    expect(sanitizePostHogUrl(consentUrl)).toBe(
      "https://app.example.test/oauth-consent",
    );
    expect(
      sanitizePostHogProperties({
        $current_url: consentUrl,
        $session_entry_url: consentUrl,
        $referrer: consentUrl,
        event_detail: "kept",
      }),
    ).toEqual({
      $current_url: "https://app.example.test/oauth-consent",
      $session_entry_url: "https://app.example.test/oauth-consent",
      $referrer: "https://app.example.test/oauth-consent",
      event_detail: "kept",
    });
  });

  it("preserves ordinary query data while removing email", () => {
    expect(
      sanitizePostHogUrl(
        "https://app.example.test/onboarding?step=2&email=user%40example.test",
      ),
    ).toBe("https://app.example.test/onboarding?step=2");
  });
});
