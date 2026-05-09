import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { createBaseAuthConfig } from "./src/lib/auth-config";

const CLI_DEV_BASE_URL = "http://localhost:3000";
const baseUrl = process.env.BETTER_AUTH_URL ?? CLI_DEV_BASE_URL;

export const auth = betterAuth({
  baseURL: baseUrl,
  secret: process.env.BETTER_AUTH_SECRET ?? randomUUID(),
  ...createBaseAuthConfig(),
});
