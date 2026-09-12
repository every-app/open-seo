import { describe, expect, it } from "vitest";
import {
  extractSafeDataforseoErrorMessage,
  formatDataforseoHttpErrorMessage,
  formatDataforseoTaskErrorMessage,
  parseDataforseoDiagnosticsFromErrorMessage,
} from "@/shared/dataforseoDiagnosticsParser";
import { scrubGlobalTraceText } from "@/shared/globalTraceTypes";

describe("DataForSEO HTTP 500 Deep Diagnostics", () => {
  // 1. HTTP 500 with body
  describe("1. HTTP 500 with body", () => {
    it("extracts safe error message and status code from JSON body", () => {
      const rawJson = JSON.stringify({
        status_code: 50000,
        status_message: "Internal Server Error in DataForSEO cluster",
      });
      const safe = extractSafeDataforseoErrorMessage(500, rawJson);
      expect(safe.statusCode).toBe(50000);
      expect(safe.statusMessage).toBe(
        "Internal Server Error in DataForSEO cluster",
      );
      expect(safe.errorClass).toBe("TRANSIENT_UPSTREAM");

      const formatted = formatDataforseoHttpErrorMessage(
        500,
        "v3/serp/google/organic/live/advanced",
        safe.statusMessage,
        safe.statusCode,
      );
      expect(formatted).toBe(
        "DataForSEO HTTP 500 on v3/serp/google/organic/live/advanced: Internal Server Error in DataForSEO cluster (50000)",
      );

      const parsed = parseDataforseoDiagnosticsFromErrorMessage(formatted);
      expect(parsed.provider).toBe("DataForSEO");
      expect(parsed.endpoint).toBe("v3/serp/google/organic/live/advanced");
      expect(parsed.httpStatus).toBe(500);
      expect(parsed.dataforseoStatusCode).toBe(50000);
      expect(parsed.dataforseoStatusMessage).toBe(
        "Internal Server Error in DataForSEO cluster",
      );
      expect(parsed.transport).toBe("HTTP");
      expect(parsed.errorClass).toBe("TRANSIENT_UPSTREAM");
    });

    it("extracts safe message from HTML title when body is HTML", () => {
      const htmlBody =
        "<html><head><title>500 Internal Server Error</title></head><body><h1>Server Error</h1></body></html>";
      const safe = extractSafeDataforseoErrorMessage(500, htmlBody);
      expect(safe.statusCode).toBeNull();
      expect(safe.statusMessage).toBe("500 Internal Server Error");
      expect(safe.errorClass).toBe("TRANSIENT_UPSTREAM");

      const formatted = formatDataforseoHttpErrorMessage(
        500,
        "v3/serp/google/organic/live/advanced",
        safe.statusMessage,
        safe.statusCode,
      );
      const parsed = parseDataforseoDiagnosticsFromErrorMessage(formatted);
      expect(parsed.httpStatus).toBe(500);
      expect(parsed.dataforseoStatusCode).toBeNull();
      expect(parsed.dataforseoStatusMessage).toBe("500 Internal Server Error");
      expect(parsed.errorClass).toBe("TRANSIENT_UPSTREAM");
    });
  });

  // 2. HTTP 500 without body
  describe("2. HTTP 500 without body", () => {
    it("reports 'no response body' when response is empty", () => {
      const safe = extractSafeDataforseoErrorMessage(500, "");
      expect(safe.statusCode).toBeNull();
      expect(safe.statusMessage).toBe("no response body");
      expect(safe.errorClass).toBe("TRANSIENT_UPSTREAM");

      const formatted = formatDataforseoHttpErrorMessage(
        500,
        "v3/serp/google/organic/live/advanced",
        safe.statusMessage,
        safe.statusCode,
      );
      expect(formatted).toBe(
        "DataForSEO HTTP 500 on v3/serp/google/organic/live/advanced (no response body)",
      );

      const parsed = parseDataforseoDiagnosticsFromErrorMessage(formatted);
      expect(parsed.provider).toBe("DataForSEO");
      expect(parsed.endpoint).toBe("v3/serp/google/organic/live/advanced");
      expect(parsed.httpStatus).toBe(500);
      expect(parsed.dataforseoStatusCode).toBeNull();
      expect(parsed.dataforseoStatusMessage).toBe("no response body");
      expect(parsed.transport).toBe("HTTP");
      expect(parsed.errorClass).toBe("TRANSIENT_UPSTREAM");
    });
  });

  // 3. HTTP 200 + task error
  describe("3. HTTP 200 + task error", () => {
    it("distinguishes task error inside HTTP 200 and detects account paused / credit issues", () => {
      const taskMessage =
        "We noticed some unusual activity in your DataForSEO account, so we've temporarily paused access as a precaution.";
      const formatted = formatDataforseoTaskErrorMessage(40201, taskMessage);
      expect(formatted).toBe(
        `DataForSEO task error (40201): ${taskMessage}`,
      );

      const parsed = parseDataforseoDiagnosticsFromErrorMessage(
        `Completed 0 of 1 keyword(s). Error: ${formatted}`,
      );
      expect(parsed.provider).toBe("DataForSEO");
      expect(parsed.httpStatus).toBe(200);
      expect(parsed.dataforseoStatusCode).toBe(40201);
      expect(parsed.dataforseoStatusMessage).toBe(taskMessage);
      expect(parsed.errorClass).toBe("CREDITS_UNAVAILABLE");
    });

    it("handles non-credit task error inside HTTP 200", () => {
      const taskMessage = "Invalid Field: 'keyword'.";
      const formatted = formatDataforseoTaskErrorMessage(40502, taskMessage);
      const parsed = parseDataforseoDiagnosticsFromErrorMessage(formatted);
      expect(parsed.httpStatus).toBe(200);
      expect(parsed.dataforseoStatusCode).toBe(40502);
      expect(parsed.dataforseoStatusMessage).toBe(taskMessage);
      expect(parsed.errorClass).toBe("TASK_ERROR");
    });
  });

  // 4. HTTP 402
  describe("4. HTTP 402", () => {
    it("distinguishes HTTP 402 payment required", () => {
      const rawJson = JSON.stringify({
        status_code: 40200,
        status_message: "Payment Required. Please top up your account.",
      });
      const safe = extractSafeDataforseoErrorMessage(402, rawJson);
      expect(safe.statusCode).toBe(40200);
      expect(safe.statusMessage).toBe(
        "Payment Required. Please top up your account.",
      );
      expect(safe.errorClass).toBe("CREDITS_UNAVAILABLE");

      const formatted = formatDataforseoHttpErrorMessage(
        402,
        "v3/serp/google/organic/live/advanced",
        safe.statusMessage,
        safe.statusCode,
      );
      const parsed = parseDataforseoDiagnosticsFromErrorMessage(formatted);
      expect(parsed.httpStatus).toBe(402);
      expect(parsed.dataforseoStatusCode).toBe(40200);
      expect(parsed.dataforseoStatusMessage).toBe(
        "Payment Required. Please top up your account.",
      );
      expect(parsed.errorClass).toBe("CREDITS_UNAVAILABLE");
    });
  });

  // 5. HTTP 429
  describe("5. HTTP 429", () => {
    it("distinguishes HTTP 429 rate limited", () => {
      const rawJson = JSON.stringify({
        status_code: 42900,
        status_message: "Minute limit exceeded",
      });
      const safe = extractSafeDataforseoErrorMessage(429, rawJson);
      expect(safe.statusCode).toBe(42900);
      expect(safe.statusMessage).toBe("Minute limit exceeded");
      expect(safe.errorClass).toBe("RATE_LIMITED");

      const formatted = formatDataforseoHttpErrorMessage(
        429,
        "v3/serp/google/organic/live/advanced",
        safe.statusMessage,
        safe.statusCode,
      );
      const parsed = parseDataforseoDiagnosticsFromErrorMessage(formatted);
      expect(parsed.httpStatus).toBe(429);
      expect(parsed.dataforseoStatusCode).toBe(42900);
      expect(parsed.dataforseoStatusMessage).toBe("Minute limit exceeded");
      expect(parsed.errorClass).toBe("RATE_LIMITED");
    });
  });

  // 6. Successful 200 + task 20000
  describe("6. successful 200 + task 20000", () => {
    it("recognizes successful 200 + task 20000 status code", () => {
      const rawJson = JSON.stringify({
        status_code: 20000,
        status_message: "Ok.",
        tasks_count: 1,
        tasks_error: 0,
        tasks: [
          {
            status_code: 20000,
            status_message: "Ok.",
            result_count: 1,
          },
        ],
      });
      const safe = extractSafeDataforseoErrorMessage(200, rawJson, {
        statusCode: 20000,
        statusMessage: "Ok.",
      });
      expect(safe.statusCode).toBe(20000);
      expect(safe.statusMessage).toBe("Ok.");
    });
  });

  // 7. Secret redaction
  describe("7. secret redaction", () => {
    it("scrubs basic auth credentials, API keys, passwords, and cookies", () => {
      const sensitiveString =
        "DataForSEO error: Authorization: Basic dXNlcjpwYXNzMTIzNDU2 password='super_secret_password' api_key=sk-1234567890abcdef1234567890abcdef Cookie: session=abcdef1234567890";
      const scrubbed = scrubGlobalTraceText(sensitiveString);

      expect(scrubbed).not.toContain("dXNlcjpwYXNzMTIzNDU2");
      expect(scrubbed).not.toContain("super_secret_password");
      expect(scrubbed).not.toContain("sk-1234567890abcdef1234567890abcdef");
      expect(scrubbed).not.toContain("session=abcdef1234567890");

      const safe = extractSafeDataforseoErrorMessage(500, sensitiveString);
      expect(safe.statusMessage).not.toContain("super_secret_password");
      expect(safe.statusMessage).not.toContain("dXNlcjpwYXNzMTIzNDU2");

      const parsed = parseDataforseoDiagnosticsFromErrorMessage(sensitiveString);
      expect(parsed.dataforseoStatusMessage).not.toContain(
        "super_secret_password",
      );
    });
  });
});
