import { env } from "cloudflare:workers";
import { APIError } from "better-auth/api";
import { isHostedAuthMode } from "@/lib/auth-mode";
import {
  ACCOUNT_DELETION_SCHEDULED_ERROR,
  formatDeletionDate,
} from "@/shared/account-deletion";
import { AccountDeletionRepository } from "./AccountDeletionRepository";

/**
 * Refuses a sign-in while the account waits to be deleted. Kept apart from
 * the service, which imports the auth instance that calls this. 400, not
 * 403: the sign-in page reads a 403 as an unverified email.
 */
export async function assertNotScheduledForDeletion(userId: string) {
  if (!isHostedAuthMode(env.AUTH_MODE)) return;
  const request = await AccountDeletionRepository.getRequest(userId);
  if (!request) return;
  throw new APIError("BAD_REQUEST", {
    code: ACCOUNT_DELETION_SCHEDULED_ERROR,
    message: `This account is scheduled for deletion on ${formatDeletionDate(request.deleteAfter)}. To keep it, email support@openseo.so before then.`,
  });
}
