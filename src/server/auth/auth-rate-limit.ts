import { z } from "zod";

// The Better Auth routes that take a password guess or send an email to an
// address the caller names. Sign-up has its own Turnstile and email checks.
const THROTTLED_PATHS = new Set([
  "/api/auth/sign-in/email",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
  "/api/auth/send-verification-email",
]);

const bodySchema = z.object({ email: z.string().min(1).max(320) });

/**
 * Throttles password sign-in and the reset and verification emails, so
 * passwords can't be guessed and an inbox can't be flooded at machine speed.
 * Counted per IP, and per email address so guesses spread over many IPs still
 * add up against one account. Returns the 429 to send, or null to carry on.
 *
 * Better Auth's own limiter is in-memory, which on Workers is per isolate, so
 * it never engages. The binding is declared in deploy/alchemy/alchemy.run.ts;
 * the wrangler.jsonc surfaces (local dev, Docker self-host) don't have it and
 * skip limiting.
 */
export async function throttleAuthRequest(
  request: Request,
  limiter: RateLimit | undefined,
): Promise<Response | null> {
  if (
    !limiter ||
    request.method !== "POST" ||
    !THROTTLED_PATHS.has(new URL(request.url).pathname)
  ) {
    return null;
  }
  const keys: string[] = [];
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) keys.push(ip);
  // A clone, so Better Auth still reads the body. /reset-password carries a
  // token instead of an email, and is counted per IP alone.
  const body = bodySchema.safeParse(
    await request
      .clone()
      .json()
      .catch(() => null),
  );
  if (body.success) keys.push(`email:${body.data.email.trim().toLowerCase()}`);

  for (const key of keys) {
    const { success } = await limiter.limit({ key });
    if (!success) {
      return Response.json(
        { message: "Too many attempts. Try again in a minute." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
  }
  return null;
}
