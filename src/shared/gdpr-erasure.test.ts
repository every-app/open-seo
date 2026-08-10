import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signGdprErasureRequest } from "./gdpr-erasure";

describe("GDPR erasure request", () => {
  it("signs the timestamp and exact body with HMAC SHA-256", async () => {
    const secret = "test-secret";
    const timestamp = "1770000000000";
    const body = '{"userId":"user_1"}';
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    await expect(signGdprErasureRequest(secret, timestamp, body)).resolves.toBe(
      expected,
    );
  });
});
