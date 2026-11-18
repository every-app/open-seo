import { expect, it, vi } from "vitest";
import { throttleAuthRequest } from "./auth-rate-limit";

const post = (path: string, body: unknown) =>
  new Request(`https://app.openseo.so${path}`, {
    method: "POST",
    headers: { "cf-connecting-ip": "203.0.113.1" },
    body: JSON.stringify(body),
  });

/** A limiter that refuses the keys it is given. */
const refusing = (...refused: string[]) => ({
  limit: vi.fn(({ key }: { key: string }) =>
    Promise.resolve({ success: !refused.includes(key) }),
  ),
});

it.each(["/api/auth/sign-in/email", "/api/auth/request-password-reset"])(
  "refuses %s for an address over its limit, whatever IP asks",
  async (path) => {
    const limiter = refusing("email:victim@example.com");
    const request = post(path, { email: " Victim@Example.com" });
    const response = await throttleAuthRequest(request, limiter);
    expect(response?.status).toBe(429);
    // Better Auth must still be able to read the body.
    expect(await request.json()).toEqual({ email: " Victim@Example.com" });
  },
);

it("refuses an IP over its limit", async () => {
  const response = await throttleAuthRequest(
    post("/api/auth/sign-in/email", { email: "a@example.com" }),
    refusing("203.0.113.1"),
  );
  expect(response?.status).toBe(429);
});

it("leaves other auth routes uncounted", async () => {
  const limiter = refusing("203.0.113.1");
  expect(
    await throttleAuthRequest(post("/api/auth/get-session", {}), limiter),
  ).toBeNull();
  expect(limiter.limit).not.toHaveBeenCalled();
});
