import { randomBytes } from "node:crypto";
import {
  expect,
  type APIRequest,
  type APIRequestContext,
  type Browser,
} from "@playwright/test";
import { z } from "zod";
import {
  authorizeOAuth,
  createApiKey,
  listOrganizations,
  signUp,
  type Account,
} from "./auth";
import { check } from "./checks";
import {
  callTool,
  describeResult,
  structured,
  type Credential,
  type ToolCall,
} from "./mcp";
import {
  createdProjectSchema,
  savedKeywordsSchema,
  savedReportSchema,
  savedTemplateSchema,
} from "./schemas";

// Run-unique suffix: emails, the marker and the intruder strings all carry it.
export const RUN = randomBytes(4).toString("hex");
// OAuth client names: A's two grants must be tellable apart in Settings.
export const CLIENT_A = "Isolation Test";
export const CLIENT_A_IN_B = "Isolation Test (B workspace)";
export const KEY_A = "Isolation key A";
export const KEY_A_IN_B = "Isolation key A in B";
// What A tries to write into B's workspace; must never land anywhere.
export const INTRUDER = `intruder-a-${RUN}`;

export type Tenant = Account & {
  orgId: string;
  orgName: string;
  projectId: string;
  oauth: Credential;
  apiKey: Credential;
};

export type SeededData = {
  marker: string;
  reportId: string;
  templateId: string;
  keywordIds: string[];
  /** Every B identifier that must never show up in A's responses. */
  secrets: string[];
};

export function reportHtml(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p></body></html>`;
}

/**
 * Signs a user up, authorizes an OAuth grant (asserting the consent page
 * names the user and the workspace), creates an API key and a project.
 */
export async function setupTenant(
  label: "A" | "B",
  deps: {
    request: APIRequest;
    browser: Browser;
    anon: APIRequestContext;
    baseURL: string;
  },
): Promise<Tenant> {
  const account = await signUp(deps.request, deps.baseURL, {
    label,
    name: `${label === "A" ? "Alice" : "Bob"} Isolation ${RUN}`,
    email: `isolation-${label.toLowerCase()}-${RUN}@example.com`,
    password: `Isolation-${RUN}-pass`,
  });
  const chapter = "1 setup";
  const organizations = await listOrganizations(account);
  check({
    chapter,
    credential: `${label} session`,
    tool: "sign-up",
    expectation: "exactly one organization to bind credentials to",
    ok: organizations.length === 1,
    detail: organizations.map((org) => `${org.name} (${org.id})`).join(", "),
  });
  expect(organizations, `${label} has exactly one organization`).toHaveLength(
    1,
  );
  const org = organizations[0];
  // A fresh account belongs to one organization, so the consent page names
  // no workspace; chapter 4 checks the row once A belongs to two.
  const oauth = await authorizeOAuth(deps.browser, deps.anon, account, {
    clientName: CLIENT_A,
    expectedWorkspace: null,
  });
  const apiKey = await createApiKey(account, `Isolation key ${label}`);
  // No organizationId argument: the credential is bound to one workspace.
  const createCall = await callTool(deps.anon, oauth, {
    name: "create_project",
    arguments: { name: `Isolation ${label} ${RUN}` },
  });
  check({
    chapter,
    credential: oauth.label,
    tool: "create_project",
    expectation: "accepted without an organizationId argument",
    ok: createCall.isError === false,
    detail: describeResult(createCall),
  });
  const created = structured(
    createCall,
    createdProjectSchema,
    `create_project for ${label}`,
  );
  return {
    ...account,
    orgId: org.id,
    orgName: org.name,
    projectId: created.project.id,
    oauth,
    apiKey,
  };
}

/** B writes its marker into context, a saved keyword, a report and a template. */
export async function seedTenantB(
  anon: APIRequestContext,
  b: Tenant,
): Promise<SeededData> {
  const marker = `secret-b-${RUN}`;
  const projectId = b.projectId;
  const seed = (call: ToolCall) => callTool(anon, b.oauth, call);

  structured(
    await seed({
      name: "update_project_context",
      arguments: {
        projectId,
        updates: [
          { section: "business_overview", content: `Confidential ${marker}` },
        ],
      },
    }),
    z.unknown(),
    "seed project context",
  );
  structured(
    await seed({
      name: "save_keywords",
      arguments: { projectId, keywords: [marker] },
    }),
    z.unknown(),
    "seed saved keyword",
  );
  const keywords = structured(
    await seed({ name: "list_saved_keywords", arguments: { projectId } }),
    savedKeywordsSchema,
    "list seeded keywords",
  );
  const keywordIds = keywords.rows.map((row) => row.id);
  expect(keywordIds.length, "B has a saved keyword").toBeGreaterThan(0);
  const report = structured(
    await seed({
      name: "save_report",
      arguments: {
        projectId,
        title: `Isolation report ${marker}`,
        summary: `Summary with ${marker}`,
        html: reportHtml(`Isolation report ${marker}`, `Body with ${marker}`),
        skill: "isolation-test",
      },
    }),
    savedReportSchema,
    "seed report",
  );
  const template = structured(
    await seed({
      name: "save_report_template",
      arguments: {
        projectId,
        name: `Isolation template ${marker}`,
        description: `Template carrying ${marker}`,
        instructions: `Always mention ${marker}.`,
      },
    }),
    savedTemplateSchema,
    "seed report template",
  );
  return {
    marker,
    reportId: report.reportId,
    templateId: template.templateId,
    keywordIds,
    secrets: [
      marker,
      b.projectId,
      report.reportId,
      template.templateId,
      ...keywordIds,
      b.orgId,
      b.email,
    ],
  };
}
