import { describe, expect, it } from "vitest";
import { scrubGlobalTraceText } from "@/shared/globalTraceTypes";

describe("Global Trace Security & Sanitization", () => {
  it("scrubs Bearer tokens and Authorization headers", () => {
    const raw = "Authorization: Bearer secret_oauth_token_12345xyz";
    const scrubbed = scrubGlobalTraceText(raw);
    expect(scrubbed).not.toContain("secret_oauth_token_12345xyz");
    expect(scrubbed).toContain("[redacted]");
  });

  it("scrubs Basic auth credentials", () => {
    const raw = "Authorization: Basic dXNlcjpwYXNzd29yZA==";
    const scrubbed = scrubGlobalTraceText(raw);
    expect(scrubbed).not.toContain("dXNlcjpwYXNzd29yZA==");
    expect(scrubbed).toContain("[redacted]");
  });

  it("scrubs OpenAI / Anthropic style API keys (sk-...)", () => {
    const raw = "Error with key: sk-proj-1234567890abcdefghijklmnop";
    const scrubbed = scrubGlobalTraceText(raw);
    expect(scrubbed).not.toContain("sk-proj-1234567890abcdefghijklmnop");
    expect(scrubbed).toContain("[redacted]");
  });

  it("scrubs password and login fields in JSON or headers", () => {
    const raw1 = JSON.stringify({ password: "mySuperSecretPassword123" });
    expect(scrubGlobalTraceText(raw1)).not.toContain("mySuperSecretPassword123");

    const raw2 = 'login: "admin_secret_user"';
    expect(scrubGlobalTraceText(raw2)).not.toContain("admin_secret_user");

    const raw3 = 'apiKey: "my-secret-key-abc"';
    expect(scrubGlobalTraceText(raw3)).not.toContain("my-secret-key-abc");
  });

  it("leaves non-sensitive operational data intact", () => {
    const safeText = "DataForSEO v3/serp/google/organic/live status=20000 location=2840";
    const scrubbed = scrubGlobalTraceText(safeText);
    expect(scrubbed).toBe(safeText);
  });
});
