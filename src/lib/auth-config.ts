import { organization } from "better-auth/plugins";
import { baseAuthOptions } from "@/lib/auth-options";

export function createBaseAuthConfig() {
  return {
    ...baseAuthOptions,
    plugins: [organization()],
  };
}
