import { APIError } from "better-auth/api";
import { z } from "zod";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { isOperatorRequest } from "@/server/standalone/operator-auth";

const signUpBodySchema = z.object({ email: z.string() });

// The standalone Docker edition closes public registration. Two sign-ups are
// still allowed from the browser: the first account on a fresh installation,
// which becomes the administrator, and an address that holds a pending
// invitation, which joins the inviter's organization. Everything else comes
// from the operator command (src/server/standalone/admin.ts).
export async function isFirstAccountOpen(): Promise<boolean> {
  return !(await AuthRepository.hasAnyUser());
}

export async function isStandaloneSignUpOpen(
  email: string | undefined,
): Promise<boolean> {
  if (await isFirstAccountOpen()) return true;
  if (!email) return false;
  return AuthRepository.hasPendingInvitationForEmail(email);
}

// The Better Auth sign-up hook. The operator command, which carries the
// operator secret, may always create an account.
export async function assertStandaloneSignUpOpen(
  headers: Headers | undefined,
  body: unknown,
): Promise<void> {
  if (isOperatorRequest(headers)) return;
  const parsed = signUpBodySchema.safeParse(body);
  if (
    await isStandaloneSignUpOpen(parsed.success ? parsed.data.email : undefined)
  )
    return;
  throw new APIError("FORBIDDEN", {
    message: "Registration is closed. Ask an administrator for an invitation.",
  });
}
