import { fileURLToPath } from "node:url";
import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  acceptInvitation,
  authorizeOAuth,
  createApiKey,
  inviteMember,
  removeMember,
  setActiveOrganization,
} from "./mcp-isolation/auth";
import { check, writeReport } from "./mcp-isolation/checks";
import {
  checkTenantBUnchanged,
  foreignProjectCalls,
  foreignResourceCalls,
  leaked,
} from "./mcp-isolation/matrix";
import {
  callTool,
  describeResult,
  type Credential,
  type ToolCall,
} from "./mcp-isolation/mcp";
import {
  deletedCountSchema,
  projectsSchema,
  whoamiSchema,
} from "./mcp-isolation/schemas";
import {
  CLIENT_A,
  CLIENT_A_IN_B,
  KEY_A,
  KEY_A_IN_B,
  RUN,
  seedTenantB,
  setupTenant,
  type SeededData,
  type Tenant,
} from "./mcp-isolation/tenants";

/**
 * Two-account tenant isolation through the real hosted /mcp endpoint.
 *
 * Run: pnpm test:e2e:mcp-isolation
 *
 * Prerequisites
 * - .env.local in hosted mode with real BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID,
 *   GOOGLE_CLIENT_SECRET (any non-empty values work for email/password
 *   sign-up) and no TURNSTILE_SITE_KEY. The config overrides AUTH_MODE, PORT,
 *   BYPASS_EMAIL_VERIFICATION and BETTER_AUTH_URL for the server it boots on
 *   :3108 (see tests/playwright.mcp-isolation.config.ts for how).
 * - The local D1 database is migrated (pnpm db:migrate:local). The suite
 *   shares .wrangler/state with `pnpm dev`; stop the :3107 server first or
 *   expect sporadic "database is locked" errors.
 * - Chrome (PLAYWRIGHT_CHANNEL=chrome by default) for the consent page and
 *   the Settings revocation steps.
 *
 * Side effects: two throwaway accounts and organizations per run (emails end
 * in @example.com). `whoami` initializes billing for both organizations, so
 * AUTUMN_SECRET_KEY should point at a sandbox. Only free tools are called; no
 * DataForSEO spend.
 *
 * Every verdict lands in .logs/mcp-isolation/report.md.
 */

const REPORT_PATH = fileURLToPath(
  new URL("../.logs/mcp-isolation/report.md", import.meta.url),
);

// Shared across the serial chapters below (one worker, one module instance).
let anon: APIRequestContext;
let a: Tenant;
let b: Tenant;
let seeded: SeededData;

const readProject = (projectId: string): ToolCall => ({
  name: "get_project_context",
  arguments: { projectId },
});

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await writeReport(REPORT_PATH, {
    Run: RUN,
    Date: new Date().toISOString(),
    "Account A": a?.email ?? "(setup failed)",
    "Account B": b?.email ?? "(setup failed)",
  });
  await Promise.all(
    [anon, a?.api, b?.api].map((context) => context?.dispose()),
  );
});

test("1. setup: two accounts, OAuth grant + API key each, B seeds marked data", async ({
  playwright,
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("baseURL is required");
  anon = await playwright.request.newContext({ baseURL });
  const deps = { request: playwright.request, browser, anon, baseURL };
  await test.step("sign up A with an OAuth grant, an API key and a project", async () => {
    a = await setupTenant("A", deps);
  });
  await test.step("sign up B with an OAuth grant, an API key and a project", async () => {
    b = await setupTenant("B", deps);
  });
  expect(a.orgId).not.toBe(b.orgId);
  await test.step("B seeds context, a keyword, a report and a template carrying its marker", async () => {
    seeded = await seedTenantB(anon, b);
  });
});

test("2. baseline: each account reads its own data; list_projects stays inside the workspace", async () => {
  const chapter = "2 baseline";
  for (const [tenant, other] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const credential of [tenant.oauth, tenant.apiKey]) {
      await test.step(`${credential.label} reads its own project`, async () => {
        const context = await callTool(
          anon,
          credential,
          readProject(tenant.projectId),
        );
        check({
          chapter,
          credential: credential.label,
          tool: "get_project_context",
          expectation: "own project readable",
          ok:
            context.isError === false &&
            (tenant !== b || context.text.includes(seeded.marker)),
          detail: describeResult(context),
        });

        const whoami = await callTool(anon, credential, { name: "whoami" });
        const identity = whoamiSchema.safeParse(whoami.structuredContent);
        check({
          chapter,
          credential: credential.label,
          tool: "whoami",
          expectation: `reports ${tenant.email}`,
          ok:
            whoami.isError === false &&
            identity.success &&
            identity.data.userEmail === tenant.email,
          detail: describeResult(whoami),
        });

        const projects = await callTool(anon, credential, {
          name: "list_projects",
        });
        const listed = projectsSchema.safeParse(projects.structuredContent);
        const ids = listed.success
          ? listed.data.projects.map((project) => project.id)
          : [];
        check({
          chapter,
          credential: credential.label,
          tool: "list_projects",
          expectation: "lists only the bound workspace's project",
          ok:
            projects.isError === false &&
            ids.length === 1 &&
            ids[0] === tenant.projectId &&
            !ids.includes(other.projectId),
          detail: `${describeResult(projects)} | ids=${ids.join(",")}`,
        });
      });
    }
  }
});

test("3. cross-tenant matrix: A cannot read, change, delete or export B's data", async () => {
  const chapter = "3 cross-tenant";
  const matrix = [
    { suffix: "B project", calls: foreignProjectCalls(b, seeded) },
    { suffix: "A project, B id", calls: foreignResourceCalls(a, seeded) },
  ];
  for (const credential of [a.oauth, a.apiKey]) {
    for (const { suffix, calls } of matrix) {
      await test.step(`${credential.label}: ${suffix}`, async () => {
        for (const call of calls) {
          const result = await callTool(anon, credential, call);
          const leaks = leaked(result, call, seeded);
          check({
            chapter,
            credential: credential.label,
            tool: `${call.name} (${suffix})`,
            expectation: "tool error, nothing of B's in the response",
            ok:
              result.status === 200 &&
              result.isError === true &&
              leaks.length === 0,
            detail: `${describeResult(result)}${leaks.length > 0 ? ` | LEAKED ${leaks.join(",")}` : ""}`,
          });
        }
      });
    }

    await test.step(`${credential.label}: remove_saved_keywords with B's ids deletes nothing`, async () => {
      // remove_saved_keywords ignores foreign ids by contract (no error), so
      // the invariant is "deleted nothing" rather than isError.
      const call: ToolCall = {
        name: "remove_saved_keywords",
        arguments: {
          projectId: a.projectId,
          savedKeywordIds: seeded.keywordIds,
        },
      };
      const result = await callTool(anon, credential, call);
      const count = deletedCountSchema.safeParse(result.structuredContent);
      check({
        chapter,
        credential: credential.label,
        tool: "remove_saved_keywords (A project, B ids)",
        expectation: "deletes nothing",
        ok:
          result.isError === false &&
          count.success &&
          count.data.deletedCount === 0 &&
          leaked(result, call, seeded).length === 0,
        detail: describeResult(result),
      });
    });
  }

  await test.step("as B: nothing changed", () =>
    checkTenantBUnchanged(anon, b, seeded, chapter));
});

test("4. membership: credentials are bound to the workspace they were created in", async ({
  browser,
}) => {
  const chapter = "4 membership";
  const readB = readProject(b.projectId);

  await test.step("B invites A as admin and A accepts", async () => {
    const invitationId = await inviteMember(b, {
      email: a.email,
      organizationId: b.orgId,
    });
    await acceptInvitation(a, invitationId);
  });

  await test.step("A's original credentials still cannot read B's project", async () => {
    for (const credential of [a.oauth, a.apiKey]) {
      const result = await callTool(anon, credential, readB);
      check({
        chapter,
        credential: credential.label,
        tool: "get_project_context (B project, A is now a member)",
        expectation: "still a tool error: bound to A's workspace",
        ok:
          result.status === 200 &&
          result.isError === true &&
          leaked(result, readB, seeded).length === 0,
        detail: describeResult(result),
      });
    }
  });

  let oauthInB: Credential;
  let apiKeyInB: Credential;
  await test.step("A switches to B's workspace on the consent page, then creates a key there", async () => {
    // Start from A's own workspace so the grant can only land in B's through
    // the consent page's switcher.
    await setActiveOrganization(a, a.orgId);
    oauthInB = await authorizeOAuth(browser, anon, a, {
      clientName: CLIENT_A_IN_B,
      expectedWorkspace: a.orgName,
      switchToWorkspace: b.orgName,
    });
    // Same switch as the account menu: it carries over to A's session.
    apiKeyInB = await createApiKey(a, KEY_A_IN_B);
    for (const credential of [oauthInB, apiKeyInB]) {
      const result = await callTool(anon, credential, readB);
      check({
        chapter,
        credential: credential.label,
        tool: "get_project_context (B project)",
        expectation: "readable: the marker appears",
        ok: result.isError === false && result.text.includes(seeded.marker),
        detail: describeResult(result),
      });
    }
  });

  await test.step("B removes A: the B-bound credentials stop working", async () => {
    await removeMember(b, { email: a.email, organizationId: b.orgId });

    const oauthResult = await callTool(anon, oauthInB, readB);
    // The transport answers a dead membership with 401 + WWW-Authenticate:
    // Bearer error="invalid_token" (src/server/mcp/transport.ts).
    check({
      chapter,
      credential: oauthInB.label,
      tool: "get_project_context (after removal)",
      expectation: "HTTP 401 with invalid_token challenge",
      ok:
        oauthResult.status === 401 &&
        /invalid_token/.test(oauthResult.headers["www-authenticate"] ?? "") &&
        leaked(oauthResult, readB, seeded).length === 0,
      detail: describeResult(oauthResult),
    });

    const keyResult = await callTool(anon, apiKeyInB, readB);
    // The API-key path answers a dead membership with 403 +
    // { error: "account_access_revoked" } (src/server/mcp/api-key-auth.ts).
    check({
      chapter,
      credential: apiKeyInB.label,
      tool: "get_project_context (after removal)",
      expectation: "HTTP 403 account_access_revoked",
      ok:
        keyResult.status === 403 &&
        keyResult.errorCode === "account_access_revoked" &&
        leaked(keyResult, readB, seeded).length === 0,
      detail: describeResult(keyResult),
    });
  });

  await test.step("A's own-workspace credentials still work", async () => {
    await setActiveOrganization(a, a.orgId);
    for (const credential of [a.oauth, a.apiKey]) {
      const result = await callTool(anon, credential, readProject(a.projectId));
      check({
        chapter,
        credential: credential.label,
        tool: "get_project_context (A project)",
        expectation: "still readable",
        ok: result.isError === false,
        detail: describeResult(result),
      });
    }
  });
});

test("5. revocation in Settings: disconnecting the agent and revoking the key block further calls", async ({
  browser,
}) => {
  const chapter = "5 revocation";
  const readA = readProject(a.projectId);
  const context = await browser.newContext({
    baseURL: a.baseURL,
    storageState: await a.api.storageState(),
  });
  const page = await context.newPage();
  try {
    // No onboarding redirect: A's OAuth consent and create_project call have
    // already completed onboarding (completeOnboardingFromAgent).
    await page.goto("/settings");

    await test.step("Settings -> Connected agents -> Disconnect", async () => {
      await expect(page.getByText("Connected agents").first()).toBeVisible();
      // RowActionsMenu aria-label is `Actions for ${clientName}`
      // (src/client/features/settings/McpConnectionsSettings.tsx); A has two
      // grants (CLIENT_A and CLIENT_A_IN_B), hence exact matching.
      const actions = page.getByRole("button", {
        name: `Actions for ${CLIENT_A}`,
        exact: true,
      });
      await actions.click();
      await page.getByRole("menuitem", { name: "Disconnect" }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Disconnect", exact: true })
        .click();
      await expect(actions).toHaveCount(0);

      const result = await callTool(anon, a.oauth, readA);
      check({
        chapter,
        credential: a.oauth.label,
        tool: "get_project_context (after Disconnect)",
        expectation: "HTTP 401 with invalid_token challenge",
        ok:
          result.status === 401 &&
          /invalid_token/.test(result.headers["www-authenticate"] ?? ""),
        detail: describeResult(result),
      });
    });

    await test.step("Settings -> API keys -> Revoke key", async () => {
      await expect(page.getByText("API keys").first()).toBeVisible();
      // aria-label `Actions for ${key.name}` and the "Revoke key" item/confirm
      // label come from ApiKeySettings.tsx.
      const actions = page.getByRole("button", {
        name: `Actions for ${KEY_A}`,
        exact: true,
      });
      await actions.click();
      await page.getByRole("menuitem", { name: "Revoke key" }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Revoke key", exact: true })
        .click();
      await expect(actions).toHaveCount(0);

      const result = await callTool(anon, a.apiKey, readA);
      check({
        chapter,
        credential: a.apiKey.label,
        tool: "get_project_context (after Revoke key)",
        expectation: "HTTP 401 invalid_api_key",
        ok: result.status === 401 && result.errorCode === "invalid_api_key",
        detail: describeResult(result),
      });
    });
  } finally {
    await context.close();
  }
});
