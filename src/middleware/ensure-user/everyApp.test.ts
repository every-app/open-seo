import { mintIdentityJwt } from "@every-app/sdk/internal";
import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

const { workerEnv } = vi.hoisted(() => ({
  workerEnv: {} as Record<string, string>,
}));
vi.mock("cloudflare:workers", () => ({ env: workerEnv }));
vi.mock("./delegated", () => ({
  ensureUserRecord: vi.fn(async (_userId: string, email: string) => email),
}));
vi.mock("@/server/auth/delegated-organization", () => ({
  ensureSharedWorkspaceOrganization: vi.fn(async () => "shared-workspace"),
}));

import { resolveEveryAppContext } from "./everyApp";

const ISSUER = "https://apps.example.com";
let privateKeyPem: string;

beforeAll(async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  privateKeyPem = await exportPKCS8(keys.privateKey);
  Object.assign(workerEnv, {
    EVERYAPP_APP_ID: "openseo",
    EVERYAPP_IDENTITY_ISSUER: ISSUER,
    EVERYAPP_IDENTITY_PUBLIC_KEYS: JSON.stringify([
      await exportSPKI(keys.publicKey),
    ]),
    EVERY_APP_ORG_ID: "org_1",
  });
});

async function signedBy(orgRole: string, orgId = "org_1") {
  const token = await mintIdentityJwt(privateKeyPem, {
    subject: { sub: "user_1", email: "ana@example.com", orgId, orgRole },
    audience: "openseo",
    issuer: ISSUER,
    channel: "web",
  });
  return new Headers({ "x-everyapp-identity": token });
}

describe("AUTH_MODE=everyapp", () => {
  it("puts a gateway user in the shared workspace with their gateway role", async () => {
    await expect(
      resolveEveryAppContext(await signedBy("admin")),
    ).resolves.toEqual({
      userId: "user_1",
      userEmail: "ana@example.com",
      emailVerified: true,
      organizationId: "shared-workspace",
      role: "admin",
    });
    await expect(
      resolveEveryAppContext(await signedBy("guest")),
    ).resolves.toMatchObject({ role: "member" });
  });

  it("refuses a request the gateway didn't sign", async () => {
    for (const headers of [
      new Headers(),
      new Headers({ "x-everyapp-identity": "forged" }),
    ]) {
      await expect(resolveEveryAppContext(headers)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    }
  });

  it("refuses an identity from another organization's install", async () => {
    await expect(
      resolveEveryAppContext(await signedBy("owner", "org_2")),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
