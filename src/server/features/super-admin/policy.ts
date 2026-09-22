import { getAuthMode } from "@/lib/auth-mode";

export function parseSuperAdminEmails(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isSuperAdmin(input: {
  authMode: string | undefined;
  userEmail: string;
  configuredEmails: string | undefined;
}) {
  if (getAuthMode(input.authMode) === "local_noauth") {
    return ["superadmin@dgtl.local", "admin@localhost"].includes(
      input.userEmail.trim().toLowerCase(),
    );
  }
  return parseSuperAdminEmails(input.configuredEmails).has(
    input.userEmail.trim().toLowerCase(),
  );
}
