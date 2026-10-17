import { mintIdentityJwt } from "@every-app/sdk/internal";
import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// AUTH_MODE=everyapp, first party (EVERY_APP_ORG_ID unset): one OpenSEO for
// every organization on the gateway. Real in-memory SQLite with every
// production migration, so the organization, user and member writes and the
// organization scoping of projects run their real queries and constraints.

const { testDb, db, workerEnv } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } =
    await import("@/server/features/ai-visibility/aiVisibilityTestDb");
  const { drizzle } = await import("drizzle-orm/libsql");
  const schema = await import("@/db/d1/schema");
  const created = await createAiVisibilityTestDb();
  return {
    testDb: created,
    // With the schema, for the repositories' relational queries.
    db: drizzle(created.client, { schema }),
    workerEnv: { DATABASE_PROVIDER: "d1" } as Record<string, string>,
  };
});
vi.mock("cloudflare:workers", () => ({ env: workerEnv }));
vi.mock("@/db", () => ({ db }));

import { resolveEveryAppContext } from "./everyApp";
import { resetEnsuredEveryAppMemberships } from "@/server/auth/delegated-organization";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";

// The Worker's name, which the gateway mints every identity for.
const AUDIENCE = "every-everyapp-openseo";
const ISSUER = "https://app.everyapp.com";
let privateKeyPem: string;

beforeAll(async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  privateKeyPem = await exportPKCS8(keys.privateKey);
  Object.assign(workerEnv, {
    EVERYAPP_APP_ID: "openseo",
    EVERYAPP_AUDIENCE: AUDIENCE,
    EVERYAPP_IDENTITY_ISSUER: ISSUER,
    EVERYAPP_IDENTITY_PUBLIC_KEYS: JSON.stringify([
      await exportSPKI(keys.publicKey),
    ]),
  });
});

beforeEach(async () => {
  delete workerEnv.EVERY_APP_ORG_ID;
  resetEnsuredEveryAppMemberships();
  await testDb.client.executeMultiple(`
    DELETE FROM projects;
    DELETE FROM member;
    DELETE FROM organization;
    DELETE FROM user;
  `);
});

async function signed(input: {
  sub?: string;
  email?: string;
  orgId: string;
  orgRole: string;
}) {
  const token = await mintIdentityJwt(privateKeyPem, {
    subject: {
      sub: input.sub ?? "user_ana",
      email: input.email ?? "ana@example.com",
      orgId: input.orgId,
      orgRole: input.orgRole,
    },
    audience: AUDIENCE,
    issuer: ISSUER,
    channel: "web",
  });
  return new Headers({ "x-everyapp-identity": token });
}

async function rows(sql: string) {
  return (await testDb.client.execute(sql)).rows;
}

async function addProject(id: string, organizationId: string) {
  await testDb.client.execute({
    sql: "INSERT INTO projects (id, organization_id, name, domain) VALUES (?, ?, ?, ?)",
    args: [id, organizationId, id, `${id}.example`],
  });
}

describe("AUTH_MODE=everyapp, first party", () => {
  it("opens the token's organization, creating it, the user and the member row on first use", async () => {
    const context = await resolveEveryAppContext(
      await signed({ orgId: "OrgAcme", orgRole: "owner" }),
    );

    expect(context).toEqual({
      userId: "user_ana",
      userEmail: "ana@example.com",
      emailVerified: true,
      organizationId: "OrgAcme",
      role: "owner",
    });
    expect(await rows("SELECT id, slug FROM organization")).toEqual([
      expect.objectContaining({
        id: "OrgAcme",
        slug: `everyapp-${Buffer.from("OrgAcme").toString("hex")}`,
      }),
    ]);
    expect(await rows("SELECT id, email FROM user")).toEqual([
      expect.objectContaining({ id: "user_ana", email: "ana@example.com" }),
    ]);
    expect(
      await rows("SELECT organization_id, user_id, role FROM member"),
    ).toEqual([
      expect.objectContaining({
        organization_id: "OrgAcme",
        user_id: "user_ana",
        role: "owner",
      }),
    ]);
  });

  it("gives ids that differ only in case their own organizations and slugs", async () => {
    await resolveEveryAppContext(
      await signed({ orgId: "OrgAcme", orgRole: "owner" }),
    );
    await resolveEveryAppContext(
      await signed({ orgId: "orgacme", orgRole: "owner" }),
    );
    expect(await rows("SELECT id FROM organization ORDER BY id")).toHaveLength(
      2,
    );
  });

  it("keeps two organizations' projects apart", async () => {
    const acme = await resolveEveryAppContext(
      await signed({ orgId: "org_acme", orgRole: "owner" }),
    );
    const globex = await resolveEveryAppContext(
      await signed({
        sub: "user_bo",
        email: "bo@example.com",
        orgId: "org_globex",
        orgRole: "owner",
      }),
    );
    await addProject("acme_site", acme.organizationId);
    await addProject("globex_site", globex.organizationId);

    expect(
      (await ProjectRepository.listProjects(acme.organizationId)).map(
        ({ id }) => id,
      ),
    ).toEqual(["acme_site"]);
    expect(
      (await ProjectRepository.listProjects(globex.organizationId)).map(
        ({ id }) => id,
      ),
    ).toEqual(["globex_site"]);
    expect(
      await ProjectRepository.getProjectForOrganization(
        "acme_site",
        globex.organizationId,
      ),
    ).toBeFalsy();
  });

  it("puts one person in two organizations in each, as the token says", async () => {
    const inAcme = await resolveEveryAppContext(
      await signed({ orgId: "org_acme", orgRole: "admin" }),
    );
    await addProject("acme_site", "org_acme");
    const inGlobex = await resolveEveryAppContext(
      await signed({ orgId: "org_globex", orgRole: "member" }),
    );

    expect(inAcme).toMatchObject({ organizationId: "org_acme", role: "admin" });
    expect(inGlobex).toMatchObject({
      organizationId: "org_globex",
      role: "member",
    });
    expect(
      await ProjectRepository.getProjectForOrganization(
        "acme_site",
        inGlobex.organizationId,
      ),
    ).toBeFalsy();
  });

  it("leaves a removed member no way back in, whatever their member row says", async () => {
    // Ana was an owner of Acme, so OpenSEO has her member row.
    await resolveEveryAppContext(
      await signed({ orgId: "org_acme", orgRole: "owner" }),
    );
    await addProject("acme_site", "org_acme");
    // The gateway removes her from Acme. It signs no token for Acme any more;
    // she still belongs to Globex, and OpenSEO's stale member row remains.
    const after = await resolveEveryAppContext(
      await signed({ orgId: "org_globex", orgRole: "member" }),
    );

    expect(
      await rows(
        "SELECT organization_id FROM member WHERE user_id = 'user_ana' ORDER BY organization_id",
      ),
    ).toEqual([
      expect.objectContaining({ organization_id: "org_acme" }),
      expect.objectContaining({ organization_id: "org_globex" }),
    ]);
    expect(after).toMatchObject({ organizationId: "org_globex" });
    expect(
      await ProjectRepository.getProjectForOrganization(
        "acme_site",
        after.organizationId,
      ),
    ).toBeFalsy();
    // And a token the gateway didn't sign gets nothing at all.
    await expect(
      resolveEveryAppContext(new Headers({ "x-everyapp-identity": "forged" })),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("takes the role from the token, never the member row", async () => {
    await resolveEveryAppContext(
      await signed({ orgId: "org_acme", orgRole: "owner" }),
    );
    const demoted = await resolveEveryAppContext(
      await signed({ orgId: "org_acme", orgRole: "member" }),
    );
    const unknownRole = await resolveEveryAppContext(
      await signed({ orgId: "org_acme", orgRole: "billing" }),
    );

    const promotedAgain = await resolveEveryAppContext(
      await signed({ orgId: "org_acme", orgRole: "owner" }),
    );

    expect(demoted.role).toBe("member");
    expect(unknownRole.role).toBe("member");
    expect(promotedAgain.role).toBe("owner");
    // The mirror follows the gateway, back and forth.
    expect(
      await rows(
        "SELECT role FROM member WHERE organization_id = 'org_acme' AND user_id = 'user_ana'",
      ),
    ).toEqual([expect.objectContaining({ role: "owner" })]);
  });

  it("writes the organization and member once per isolate", async () => {
    const ensureOrganization = vi.spyOn(AuthRepository, "ensureOrganization");
    const upsertMember = vi.spyOn(AuthRepository, "upsertMember");
    for (let request = 0; request < 3; request++) {
      await resolveEveryAppContext(
        await signed({ orgId: "org_acme", orgRole: "admin" }),
      );
    }
    expect(ensureOrganization).toHaveBeenCalledTimes(1);
    expect(upsertMember).toHaveBeenCalledTimes(1);
  });

  it("pins a fork to its organization's shared workspace when EVERY_APP_ORG_ID is set", async () => {
    workerEnv.EVERY_APP_ORG_ID = "org_acme";

    await expect(
      resolveEveryAppContext(
        await signed({ orgId: "org_acme", orgRole: "admin" }),
      ),
    ).resolves.toMatchObject({
      organizationId: "shared-workspace",
      role: "admin",
    });
    await expect(
      resolveEveryAppContext(
        await signed({ orgId: "org_globex", orgRole: "owner" }),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    // No organization or member row for the token's organization.
    expect(await rows("SELECT id FROM organization")).toEqual([
      expect.objectContaining({ id: "shared-workspace" }),
    ]);
    expect(await rows("SELECT id FROM member")).toEqual([]);
  });
});
