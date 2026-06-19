// Free-plan users get a bounded number of strategy-refinement questions in the
// onboarding chat before they're nudged to subscribe. Shared so the client gate
// (disables the composer, shows "N left") and the server-side re-check agree on
// the same number. NOTE: the server counts client-supplied chat history, so a
// crafted client can keep the count low — this cap is a conversion nudge, not a
// security boundary. The real spend bound is the org's credit balance (asserted
// server-side on every turn and inside each DataForSEO call).
export const FREE_ONBOARDING_QUESTION_LIMIT = 7;
