import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { baseAuthConfig } from "./src/lib/auth-config";

const CLI_DEV_BASE_URL = "http://localhost:3000";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? CLI_DEV_BASE_URL,
  secret: process.env.BETTER_AUTH_SECRET ?? randomUUID(),
  ...baseAuthConfig,
});
