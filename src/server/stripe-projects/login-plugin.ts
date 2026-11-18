import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { sha256Hex } from "@/server/lib/audit/ids";

// `stripe projects open openseo` opens /stripe-projects/login?token=..., which
// names the account and asks before signing in. Its button posts the token
// here. The token is single-use, lasts ten minutes, and can only be minted by
// a request carrying both Stripe's signature and the account's bearer
// (service.ts createLoginLink). Registered in hosted mode only (lib/auth.ts).

export const loginLinkSchema = z.object({
  userId: z.string(),
  organizationId: z.string(),
  path: z.string(),
});

// Where the link lives in Better Auth's verification store; only the token's
// hash is stored.
export async function loginLinkIdentifier(token: string) {
  return `stripe-projects-login:${await sha256Hex(token)}`;
}

export function stripeProjectsLoginPlugin() {
  return {
    id: "stripe-projects-login",
    endpoints: {
      stripeProjectsLogin: createAuthEndpoint(
        "/stripe-projects/login",
        { method: "POST", body: z.object({ token: z.string().min(1) }) },
        async (ctx) => {
          const { internalAdapter } = ctx.context;
          const row = await internalAdapter.consumeVerificationValue(
            await loginLinkIdentifier(ctx.body.token),
          );
          const link =
            row && row.expiresAt > new Date()
              ? loginLinkSchema.parse(JSON.parse(row.value))
              : null;
          const user =
            link &&
            (await AuthRepository.getMembership(
              link.userId,
              link.organizationId,
            ))
              ? await internalAdapter.findUserById(link.userId)
              : null;
          // An account that lost its verified email signs in the usual way.
          if (!link || !user?.emailVerified) {
            throw new APIError("BAD_REQUEST", {
              message: "This sign-in link has expired or was already used.",
            });
          }

          // Land in the organization Stripe provisioned: the session-create
          // hook starts from the last-active organization.
          await AuthRepository.setLastActiveOrganization(
            user.id,
            link.organizationId,
          );
          const session = await internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ path: link.path });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
