import { env } from "cloudflare:workers";
import { AppError } from "@/server/lib/errors";
import { isSuperAdmin } from "./policy";

export function canAccessSuperAdmin(userEmail: string) {
  return isSuperAdmin({
    authMode: env.AUTH_MODE,
    userEmail,
    configuredEmails: env.SUPER_ADMIN_EMAILS,
  });
}

export function requireSuperAdmin(userEmail: string) {
  if (!canAccessSuperAdmin(userEmail)) throw new AppError("FORBIDDEN");
}
