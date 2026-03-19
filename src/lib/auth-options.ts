export const HOSTED_PASSWORD_MIN_LENGTH = 8;
export const HOSTED_PASSWORD_MAX_LENGTH = 128;

export const baseAuthOptions = {
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    minPasswordLength: HOSTED_PASSWORD_MIN_LENGTH,
    maxPasswordLength: HOSTED_PASSWORD_MAX_LENGTH,
  },
};
