import { GoogleAccountRepository } from "./GoogleAccountRepository";

type AccountInput = {
  userId: string;
  provider: "gsc" | "ga4";
  accountId: string;
};

async function getRemovalImpact(input: AccountInput) {
  return GoogleAccountRepository.getRemovalImpact(input);
}

async function remove(input: AccountInput) {
  // A user owns their personal Google authorization even when its projects
  // belong to other organizations. Removing it releases the provider identity
  // for another app user; it does not delete Google sign-in or other scopes.
  await GoogleAccountRepository.remove(input);
  return { removed: true as const };
}

export const GoogleAccountService = { getRemovalImpact, remove };
