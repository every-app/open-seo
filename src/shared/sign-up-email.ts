/**
 * What the sign-up form shows when hosted sign-up refuses an email address
 * (src/server/auth/disposable-email.ts).
 */
export const SIGN_UP_EMAIL_REFUSED_MESSAGE =
  "We can't accept that email address. Sign up with a different one.";

/**
 * The same refusal as the `error` code on /auth-error, where a refused Google
 * or ChatGPT sign-up lands.
 */
export const SIGN_UP_EMAIL_REFUSED_CODE = "email_not_accepted";
