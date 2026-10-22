import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { CURRENT_TERMS_VERSION } from "@/shared/terms";

// The version is always the server's current one: the client only says "I
// accept", so it can never record acceptance of some other version.
async function acceptCurrentTerms(userId: string) {
  await AuthRepository.setTermsAcceptance(
    userId,
    CURRENT_TERMS_VERSION,
    new Date(),
  );
}

export const TermsAcceptanceService = {
  acceptCurrentTerms,
};
