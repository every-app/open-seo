import { describe, expect, it } from "vitest";
import {
  sanitizePostHogCapturedNetworkRequest,
  sanitizePostHogProperties,
  sanitizePostHogUrl,
} from "@/client/lib/posthog-sanitize";

const consentUrl =
  "https://app.example.test/oauth-consent?response_type=code&client_id=test-client&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=openid&state=state-secret&code_challenge=pkce-challenge&code_challenge_method=S256&resource=https%3A%2F%2Fapp.example.test%2Fmcp&future_parameter=future-secret";

const sampleApiKey =
  "oseo_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP";

describe("sanitizePostHogUrl", () => {
  it("removes the complete query from OAuth consent URLs", () => {
    expect(sanitizePostHogUrl(consentUrl)).toBe(
      "https://app.example.test/oauth-consent",
    );
  });

  it("preserves ordinary query data while removing email", () => {
    expect(
      sanitizePostHogUrl(
        "https://app.example.test/onboarding?step=2&email=user%40example.test",
      ),
    ).toBe("https://app.example.test/onboarding?step=2");
  });

  it("leaves malformed URLs unchanged", () => {
    expect(sanitizePostHogUrl("not a URL")).toBe("not a URL");
  });
});

describe("sanitizePostHogProperties", () => {
  it("sanitizes consent URLs on custom events and session properties", () => {
    const properties: Record<string, unknown> = {
      $current_url: consentUrl,
      $session_entry_url: consentUrl,
      $referrer: consentUrl,
      event_detail: "kept",
    };

    expect(sanitizePostHogProperties(properties)).toEqual({
      $current_url: "https://app.example.test/oauth-consent",
      $session_entry_url: "https://app.example.test/oauth-consent",
      $referrer: "https://app.example.test/oauth-consent",
      event_detail: "kept",
    });
  });
});

describe("sanitizePostHogCapturedNetworkRequest", () => {
  it("strips bodies from Better Auth API-key create responses", () => {
    expect(
      sanitizePostHogCapturedNetworkRequest({
        name: "https://app.example.test/api/auth/api-key/create",
        requestBody: '{"name":"laptop"}',
        responseBody: JSON.stringify({ key: sampleApiKey }),
        status: 200,
      }),
    ).toEqual({
      name: "https://app.example.test/api/auth/api-key/create",
      status: 200,
    });
  });

  it("redacts oseo_ keys that appear in unrelated captured bodies", () => {
    expect(
      sanitizePostHogCapturedNetworkRequest({
        name: "https://app.example.test/api/projects",
        responseBody: `{"note":"use ${sampleApiKey}"}`,
      }),
    ).toEqual({
      name: "https://app.example.test/api/projects",
      responseBody: '{"note":"use oseo_[REDACTED]"}',
    });
  });

  it("leaves short display prefixes alone", () => {
    expect(
      sanitizePostHogCapturedNetworkRequest({
        name: "https://app.example.test/api/projects",
        responseBody: '{"start":"oseo_abcd"}',
      }),
    ).toEqual({
      name: "https://app.example.test/api/projects",
      responseBody: '{"start":"oseo_abcd"}',
    });
  });
});
