export const HOSTED_PASSWORD_MIN_LENGTH = 8;
export const HOSTED_PASSWORD_MAX_LENGTH = 128;

export const userAdditionalFields = {
  analyticsOptedOut: {
    type: "boolean" as const,
    defaultValue: () => false,
    required: false as const,
    input: true as const,
  },
};

export const baseAuthOptions = {
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    minPasswordLength: HOSTED_PASSWORD_MIN_LENGTH,
    maxPasswordLength: HOSTED_PASSWORD_MAX_LENGTH,
  },
  user: {
    additionalFields: userAdditionalFields,
  },
  session: {
    // Serve getSession from a signed cookie instead of a DB round trip. The
    // session lookup runs on every authenticated request, and the DB lives in
    // us-east — from far colos that single query was ~1s of wall time. The
    // trade-off is revocation lag: a session revoked elsewhere (sign-out on
    // another device, password reset) stays valid on an already-issued cookie
    // for up to maxAge. Authorization still hits the DB via the canonical
    // project-access checks, so the cookie only vouches for identity.
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
};
