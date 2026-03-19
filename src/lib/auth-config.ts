import { organization } from "better-auth/plugins";
import { baseAuthOptions } from "@/lib/auth-options";

export const baseAuthConfig = {
  ...baseAuthOptions,
  plugins: [organization()],
};
