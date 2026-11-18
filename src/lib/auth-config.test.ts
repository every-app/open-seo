import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { expect, it } from "vitest";
import { createBaseAuthConfig } from "./auth-config";

const auth = betterAuth({
  ...createBaseAuthConfig(),
  baseURL: "http://localhost",
  secret: "x".repeat(32),
  database: memoryAdapter({}),
});

const get = (path: string) =>
  auth.handler(new Request(`http://localhost/api/auth${path}`));

it("hides the routes that list invitations and their ids", async () => {
  for (const path of [
    "/organization/get-full-organization",
    "/organization/list-invitations",
    "/organization/list-user-invitations",
  ]) {
    expect((await get(path)).status, path).toBe(404);
  }
  // An unauthenticated request to a route that stays on is refused, not missing.
  expect((await get("/organization/list-members")).status).not.toBe(404);
});
