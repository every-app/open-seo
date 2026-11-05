// Guest accounts (src/server/auth/guest-accounts.ts) get a placeholder email
// on a reserved .invalid domain, which no mail server will ever accept. It
// keeps the user table's required, unique email column satisfied and marks
// addresses that must never be emailed.
const GUEST_EMAIL_DOMAIN = "guest.openseo.invalid";

export function guestEmail(userId: string) {
  return `${userId}@${GUEST_EMAIL_DOMAIN}`;
}

export function isGuestEmail(email: string | null | undefined) {
  return Boolean(email?.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`));
}
