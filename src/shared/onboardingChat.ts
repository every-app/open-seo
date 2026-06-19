// Free-plan users get a bounded number of strategy-refinement questions in the
// onboarding chat before they're asked to subscribe. Shared so the client gate
// (disables the composer, shows "N left") and the server backstop (rejects an
// over-limit request that bypassed the client) agree on the same number.
export const FREE_ONBOARDING_QUESTION_LIMIT = 7;
