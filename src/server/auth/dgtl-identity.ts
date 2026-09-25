import { APIError } from "better-auth/api";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";

/** A second central subject requires an explicit, verified account migration. */
export async function ensureSingleDgtlIdentity(account: {
  userId: string;
  providerId: string;
  accountId: string;
}): Promise<void> {
  if (account.providerId !== "dgtl-sso") return;
  const linked = await AuthRepository.getDgtlAccount(account.userId);
  if (linked.length) {
    console.warn("DGTL account linking: existing_central_identity");
    throw new APIError("FORBIDDEN", {
      message:
        "This SEO account already has a central identity. Contact support to migrate it.",
    });
  }
}
