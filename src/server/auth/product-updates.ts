import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { updateProductUpdatesSubscription } from "@/server/email/loops";

// Loops first: if the sync fails, the saved choice stays as it was and the
// user sees an error to retry, instead of the account showing a choice (say,
// an opt-out) that Loops never got.
async function setOptIn(input: {
  userId: string;
  email: string;
  optIn: boolean;
}) {
  await updateProductUpdatesSubscription(input);
  await AuthRepository.setProductUpdatesOptIn(
    input.userId,
    input.optIn,
    new Date(),
  );
}

export const ProductUpdatesService = {
  setOptIn,
};
