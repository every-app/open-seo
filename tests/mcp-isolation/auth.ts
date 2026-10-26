import { createHash, randomBytes } from "node:crypto";
import {
  expect,
  type APIRequest,
  type APIRequestContext,
  type APIResponse,
  type Browser,
} from "@playwright/test";
import { z } from "zod";
import type { Credential } from "./mcp";

// What a real MCP client (Codex, Claude Code) registers as its callback.
const REDIRECT_URI = "http://localhost:1455/auth/callback";

/** A signed-up hosted user with its own cookie jar. */
export type Account = {
  label: string;
  name: string;
  email: string;
  password: string;
  baseURL: string;
  api: APIRequestContext;
};

async function readJson(response: APIResponse, what: string): Promise<unknown> {
  const text = await response.text();
  expect(
    response.ok(),
    `${what}: HTTP ${response.status()} ${text.slice(0, 300)}`,
  ).toBe(true);
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

/**
 * Email + password sign-up through Better Auth. BYPASS_EMAIL_VERIFICATION=true
 * makes the response set the session cookie right away, and the session-create
 * hook mints the user's default organization. The context sends Origin on
 * every request because Better Auth checks it on POST.
 */
export async function signUp(
  request: APIRequest,
  baseURL: string,
  account: Pick<Account, "label" | "name" | "email" | "password">,
): Promise<Account> {
  const api = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  await readJson(
    await api.post("/api/auth/sign-up/email", {
      data: {
        name: account.name,
        email: account.email,
        password: account.password,
      },
    }),
    `sign up ${account.label}`,
  );
  return { ...account, baseURL, api };
}

const organizationListSchema = z.array(
  z.looseObject({ id: z.string(), name: z.string() }),
);

export async function listOrganizations(account: Account) {
  return organizationListSchema.parse(
    await readJson(
      await account.api.get("/api/auth/organization/list"),
      `list organizations for ${account.label}`,
    ),
  );
}

export async function setActiveOrganization(
  account: Account,
  organizationId: string,
) {
  await readJson(
    await account.api.post("/api/auth/organization/set-active", {
      data: { organizationId },
    }),
    `set active organization for ${account.label}`,
  );
}

const invitationSchema = z.looseObject({ id: z.string() });

/**
 * The raw invite endpoint creates the pending invitation and emails nobody
 * (the app's sendTeamInvitation server function is what sends mail), which is
 * exactly what the membership chapter needs. The response carries the
 * invitation id; `list-user-invitations` is avoided because it requires a
 * verified email, which BYPASS_EMAIL_VERIFICATION accounts never get.
 */
export async function inviteMember(
  inviter: Account,
  input: { email: string; organizationId: string },
) {
  const invitation = invitationSchema.parse(
    await readJson(
      await inviter.api.post("/api/auth/organization/invite-member", {
        // The app only ever mints "admin" (enforced in lib/auth.ts).
        data: { ...input, role: "admin" },
      }),
      `${inviter.label} invites ${input.email}`,
    ),
  );
  return invitation.id;
}

/** Also switches the accepting session's active organization to the new one. */
export async function acceptInvitation(account: Account, invitationId: string) {
  await readJson(
    await account.api.post("/api/auth/organization/accept-invitation", {
      data: { invitationId },
    }),
    `${account.label} accepts invitation`,
  );
}

export async function removeMember(
  owner: Account,
  input: { email: string; organizationId: string },
) {
  await readJson(
    await owner.api.post("/api/auth/organization/remove-member", {
      data: {
        memberIdOrEmail: input.email,
        organizationId: input.organizationId,
      },
    }),
    `${owner.label} removes ${input.email}`,
  );
}

const createdApiKeySchema = z.looseObject({ key: z.string() });

/**
 * The key is returned once. It is bound server-side to the session's active
 * organization (the /api-key/create before-hook in lib/auth.ts stamps
 * metadata.organizationId); the client never sends metadata.
 */
export async function createApiKey(
  account: Account,
  name: string,
): Promise<Credential> {
  const created = createdApiKeySchema.parse(
    await readJson(
      await account.api.post("/api/auth/api-key/create", { data: { name } }),
      `create API key "${name}" for ${account.label}`,
    ),
  );
  return { label: `${account.label} api-key (${name})`, secret: created.key };
}

const registrationSchema = z.looseObject({ client_id: z.string() });
const tokenResponseSchema = z.looseObject({ access_token: z.string() });

// Codex-style dynamic client registration: no token_endpoint_auth_method, so
// the server registers a public client.
async function registerOAuthClient(
  anon: APIRequestContext,
  clientName: string,
) {
  const registration = registrationSchema.parse(
    await readJson(
      await anon.post("/api/auth/oauth2/register", {
        data: {
          client_name: clientName,
          redirect_uris: [REDIRECT_URI],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        },
      }),
      `register OAuth client "${clientName}"`,
    ),
  );
  return registration.client_id;
}

/**
 * The full authorization-code + PKCE flow, driven the way a real client drives
 * it: /api/auth/oauth2/authorize in the user's browser, the consent page, the
 * redirect back to the client's callback (intercepted here), then the code
 * exchange at the token endpoint. Along the way it asserts that the consent
 * page names the signed-in user and the workspace the grant will be bound to.
 */
export async function authorizeOAuth(
  browser: Browser,
  anon: APIRequestContext,
  account: Account,
  options: {
    clientName: string;
    // The Workspace row only renders for people in more than one
    // organization; null asserts it is absent.
    expectedWorkspace: string | null;
    // Pick this workspace in the consent page's switcher before authorizing.
    switchToWorkspace?: string;
  },
): Promise<Credential> {
  const label = `${account.label} oauth (${options.clientName})`;
  const clientId = await registerOAuthClient(anon, options.clientName);
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const resource = `${account.baseURL}/mcp`;
  const authorizeQuery = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: "offline_access mcp",
    state: randomBytes(8).toString("hex"),
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    resource,
  });

  // A browser signed in as this user: copy the cookie jar from its API context.
  const context = await browser.newContext({
    baseURL: account.baseURL,
    storageState: await account.api.storageState(),
  });
  let code: string | null;
  try {
    const page = await context.newPage();
    // Nothing listens on :1455; answer the callback navigation ourselves and
    // read the code off the request URL.
    await page.route(`${REDIRECT_URI}**`, (route) =>
      route.fulfill({ status: 200, body: "ok" }),
    );
    await page.goto(`/api/auth/oauth2/authorize?${authorizeQuery.toString()}`);
    await expect(page).toHaveURL(/\/oauth-consent\?/);
    const authorize = page.getByRole("button", {
      name: "Authorize",
      exact: true,
    });
    await expect(authorize).toBeVisible();
    // The "Signed in as" and "Workspace" rows of the consent card
    // (src/routes/_authenticated.oauth-consent.tsx).
    await expect(page.getByText(account.email).first()).toBeVisible();
    const workspaceRow = page.getByText("Workspace", { exact: true });
    if (options.expectedWorkspace) {
      await expect(workspaceRow).toBeVisible();
      await expect(
        page.getByText(options.expectedWorkspace, { exact: true }).first(),
      ).toBeVisible();
    } else {
      await expect(workspaceRow).toBeHidden();
    }
    if (options.switchToWorkspace) {
      const switcher = page.getByRole("combobox", { name: "Workspace" });
      await switcher.click();
      await page
        .getByRole("option", { name: options.switchToWorkspace, exact: true })
        .click();
      // The trigger shows the new name once the switch has landed and the
      // organization context refetched.
      await expect(switcher).toContainText(options.switchToWorkspace);
      await expect(authorize).toBeEnabled();
    }

    const callback = page.waitForRequest((request) =>
      request.url().startsWith(REDIRECT_URI),
    );
    await authorize.click();
    code = new URL((await callback).url()).searchParams.get("code");
  } finally {
    await context.close();
  }
  expect(code, "authorization code in the callback redirect").toBeTruthy();

  const tokens = tokenResponseSchema.parse(
    await readJson(
      await anon.post("/api/auth/oauth2/token", {
        form: {
          grant_type: "authorization_code",
          code: code ?? "",
          redirect_uri: REDIRECT_URI,
          client_id: clientId,
          code_verifier: codeVerifier,
          resource,
        },
      }),
      `exchange code for ${account.label}`,
    ),
  );
  return { label, secret: tokens.access_token };
}
