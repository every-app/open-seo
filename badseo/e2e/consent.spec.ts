/* eslint-disable max-lines -- End-to-end lifecycle scenarios stay together so shared consent helpers and ordering remain visible. */
import {
  expect,
  test,
  type BrowserContext,
  type Request as PlaywrightRequest,
  type Route,
} from "@playwright/test";

const STORAGE_KEY = "badseo:analytics-consent:v2";

interface ConsentRequestBody {
  action?: string;
  receiptId?: string;
}

interface StoredConsentRecord {
  choice?: string;
  measurementId?: string;
  receiptId?: string;
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function readStringProperty(
  value: unknown,
  key: "action" | "choice" | "measurementId" | "receiptId",
): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  switch (key) {
    case "action":
      return "action" in value && typeof value.action === "string"
        ? value.action
        : undefined;
    case "choice":
      return "choice" in value && typeof value.choice === "string"
        ? value.choice
        : undefined;
    case "measurementId":
      return "measurementId" in value && typeof value.measurementId === "string"
        ? value.measurementId
        : undefined;
    case "receiptId":
      return "receiptId" in value && typeof value.receiptId === "string"
        ? value.receiptId
        : undefined;
  }
}

function consentRequestBody(request: PlaywrightRequest): ConsentRequestBody {
  const parsed = parseJson(request.postData());
  return {
    action: readStringProperty(parsed, "action"),
    receiptId: readStringProperty(parsed, "receiptId"),
  };
}

function parseStoredConsent(raw: string | null): StoredConsentRecord | null {
  const parsed = parseJson(raw);
  if (parsed === null || typeof parsed !== "object") return null;
  return {
    choice: readStringProperty(parsed, "choice"),
    measurementId: readStringProperty(parsed, "measurementId"),
    receiptId: readStringProperty(parsed, "receiptId"),
  };
}

function requireStoredConsent(raw: string | null): StoredConsentRecord {
  const record = parseStoredConsent(raw);
  if (!record) throw new Error("Expected a valid stored consent record");
  return record;
}

async function mockGoogleTag(context: BrowserContext): Promise<void> {
  await context.route("https://www.googletagmanager.com/**", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: [
        'document.cookie="_ga=test-client; Path=/; SameSite=Lax";',
        'document.cookie="_ga_TEST123=test-session; Path=/; SameSite=Lax";',
      ].join(""),
    }),
  );
}

test("serves a local privacy policy and canonicalizes the consent origin", async ({
  request,
}) => {
  const home = await request.get("/");
  const homeHtml = await home.text();
  expect(homeHtml).toContain('<script src="/analytics.js" defer></script>');
  expect(homeHtml).not.toContain("fonts.googleapis.com");

  const privacy = await request.get("/privacy");
  const privacyHtml = await privacy.text();
  expect(privacy.status()).toBe(200);
  expect(privacyHtml).toContain("<title>Privacy policy | badseo.dev</title>");
  expect(privacyHtml).toContain("<h1>Privacy policy</h1>");
  expect(privacyHtml).toContain('href="/privacy"');

  const sitemap = await request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain(
    "<loc>http://127.0.0.1:18787/privacy</loc>",
  );

  const redirect = await request.get("/privacy?source=redirect-test", {
    headers: { host: "www.badseo.dev" },
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe(
    "https://badseo.dev/privacy?source=redirect-test",
  );

  const insecureApex = await request.get("/privacy?source=http-test", {
    headers: { host: "badseo.dev" },
    maxRedirects: 0,
  });
  expect(insecureApex.status()).toBe(308);
  expect(insecureApex.headers().location).toBe(
    "https://badseo.dev/privacy?source=http-test",
  );
});

test("synchronizes grants and withdrawals across open tabs", async ({
  context,
}) => {
  await mockGoogleTag(context);
  const googleRequests: string[] = [];
  context.on("request", (request) => {
    if (
      request.url().includes("googletagmanager.com") ||
      request.url().includes("google-analytics.com")
    ) {
      googleRequests.push(request.url());
    }
  });

  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageA.goto("/?campaign=private#fragment", {
    waitUntil: "networkidle",
  });
  await pageB.goto("/", { waitUntil: "networkidle" });

  await expect(
    pageA.getByRole("button", { name: "Accept analytics" }),
  ).toBeVisible();
  await expect(
    pageB.getByRole("button", { name: "Accept analytics" }),
  ).toBeVisible();
  expect(googleRequests).toEqual([]);

  const [grantResponse] = await Promise.all([
    pageA.waitForResponse(
      (response) =>
        response.url().endsWith("/analytics-consent") &&
        consentRequestBody(response.request()).action === "grant",
    ),
    pageA.getByRole("button", { name: "Accept analytics" }).click(),
  ]);
  expect(grantResponse.status()).toBe(201);
  await expect(pageA.locator("#badseo-google-analytics")).toHaveCount(1);
  await expect(pageB.locator("#badseo-google-analytics")).toHaveCount(1);

  const storedGrant = requireStoredConsent(
    await pageA.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  );
  expect(storedGrant).toMatchObject({
    choice: "granted",
    measurementId: "G-TEST123",
  });
  expect(storedGrant.receiptId).toMatch(/^[0-9a-f-]{36}$/i);

  await pageB.getByRole("button", { name: "Cookie settings" }).click();
  const pageAReloaded = pageA.waitForEvent("load");
  const [withdrawResponse] = await Promise.all([
    pageB.waitForResponse(
      (response) =>
        response.url().endsWith("/analytics-consent") &&
        consentRequestBody(response.request()).action === "withdraw",
    ),
    pageB.getByRole("button", { name: "Reject" }).click(),
  ]);
  expect(withdrawResponse.status()).toBe(201);
  await pageAReloaded;
  await pageA.waitForLoadState("networkidle");

  await expect(pageA.locator("#badseo-google-analytics")).toHaveCount(0);
  await expect(pageB.locator("#badseo-google-analytics")).toHaveCount(0);
  expect(
    (await context.cookies()).filter((cookie) => cookie.name.startsWith("_ga")),
  ).toEqual([]);
});

test("a newer rejection supersedes an in-flight grant", async ({ context }) => {
  const googleRequests: string[] = [];
  context.on("request", (request) => {
    if (
      request.url().includes("googletagmanager.com") ||
      request.url().includes("google-analytics.com")
    ) {
      googleRequests.push(request.url());
    }
  });

  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageA.goto("/", { waitUntil: "networkidle" });
  await pageB.goto("/", { waitUntil: "networkidle" });

  await pageA.evaluate(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await nativeFetch(input, init);
      const body = typeof init?.body === "string" ? init.body : "";
      if (body.includes('"action":"grant"')) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
      return response;
    };
  });

  const compensatingWithdrawal = pageA.waitForResponse(
    (response) =>
      response.url().endsWith("/analytics-consent") &&
      consentRequestBody(response.request()).action === "withdraw",
  );
  await pageA.getByRole("button", { name: "Accept analytics" }).click();
  await pageA.waitForTimeout(100);
  await pageB.getByRole("button", { name: "Reject" }).click();

  expect((await compensatingWithdrawal).status()).toBe(201);
  await pageA.waitForTimeout(150);
  await expect(pageA.locator("#badseo-google-analytics")).toHaveCount(0);
  await expect(pageB.locator("#badseo-google-analytics")).toHaveCount(0);
  expect(googleRequests).toEqual([]);

  const storedChoice = parseStoredConsent(
    await pageA.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  )?.choice;
  expect(storedChoice).toBe("denied");
});

test("a rejection during withdrawal preflight prevents a stale grant", async ({
  context,
}) => {
  const grantRequests: string[] = [];
  context.on("request", (request) => {
    if (
      request.url().endsWith("/analytics-consent") &&
      consentRequestBody(request).action === "grant"
    ) {
      grantRequests.push(request.postData() ?? "");
    }
  });

  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageA.goto("/", { waitUntil: "networkidle" });
  await pageB.goto("/", { waitUntil: "networkidle" });

  const pendingReceiptId = "123e4567-e89b-42d3-a456-426614174001";
  await pageB.evaluate((receiptId) => {
    localStorage.setItem(
      `badseo:analytics-withdrawal:v1:${receiptId}`,
      JSON.stringify({
        requestId: "123e4567-e89b-42d3-a456-426614174002",
        measurementId: "G-TEST123",
        createdAt: new Date().toISOString(),
      }),
    );

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await nativeFetch(input, init);
      const body = typeof init?.body === "string" ? init.body : "";
      if (body.includes('"action":"withdraw"')) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
      return response;
    };
  }, pendingReceiptId);

  const withdrawal = pageB.waitForResponse(
    (response) =>
      response.url().endsWith("/analytics-consent") &&
      consentRequestBody(response.request()).action === "withdraw",
  );
  await pageB.getByRole("button", { name: "Accept analytics" }).click();
  await withdrawal;
  await pageB.waitForTimeout(100);
  await pageA.getByRole("button", { name: "Reject" }).click();
  await pageB.waitForTimeout(550);

  expect(grantRequests).toEqual([]);
  await expect(pageA.locator("#badseo-google-analytics")).toHaveCount(0);
  await expect(pageB.locator("#badseo-google-analytics")).toHaveCount(0);
  const state = await pageB.evaluate(
    ({ key, receiptId }) => ({
      consent: localStorage.getItem(key),
      pending: localStorage.getItem(
        `badseo:analytics-withdrawal:v1:${receiptId}`,
      ),
    }),
    { key: STORAGE_KEY, receiptId: pendingReceiptId },
  );
  expect(parseStoredConsent(state.consent)?.choice).toBe("denied");
  expect(state.pending).toBeNull();
});

test("retries a failed withdrawal from its per-receipt marker", async ({
  context,
}) => {
  await mockGoogleTag(context);
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "networkidle" });

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/analytics-consent") &&
        consentRequestBody(response.request()).action === "grant",
    ),
    page.getByRole("button", { name: "Accept analytics" }).click(),
  ]);
  await expect(page.locator("#badseo-google-analytics")).toHaveCount(1);

  let failFirstWithdrawal = true;
  await page.route("**/analytics-consent", async (route) => {
    const action = consentRequestBody(route.request()).action;
    if (action === "withdraw" && failFirstWithdrawal) {
      failFirstWithdrawal = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"simulated outage"}',
      });
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Cookie settings" }).click();
  const failedWrite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/analytics-consent") &&
      response.status() === 503,
  );
  const retriedWrite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/analytics-consent") &&
      response.status() === 201 &&
      consentRequestBody(response.request()).action === "withdraw",
  );
  await page.getByRole("button", { name: "Reject" }).click();

  await failedWrite;
  await retriedWrite;
  await page.waitForLoadState("networkidle");
  const pendingKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) =>
      key.startsWith("badseo:analytics-withdrawal:v1:"),
    ),
  );
  expect(pendingKeys).toEqual([]);
  await expect(page.locator("#badseo-google-analytics")).toHaveCount(0);
});

test("concurrent re-grants sharing a receipt do not append a withdrawal", async ({
  context,
}) => {
  await mockGoogleTag(context);
  const pageA = await context.newPage();
  await pageA.goto("/", { waitUntil: "networkidle" });

  await Promise.all([
    pageA.waitForResponse(
      (response) =>
        response.url().endsWith("/analytics-consent") &&
        consentRequestBody(response.request()).action === "grant",
    ),
    pageA.getByRole("button", { name: "Accept analytics" }).click(),
  ]);
  await pageA.getByRole("button", { name: "Cookie settings" }).click();
  await Promise.all([
    pageA.waitForResponse(
      (response) =>
        response.url().endsWith("/analytics-consent") &&
        consentRequestBody(response.request()).action === "withdraw",
    ),
    pageA.getByRole("button", { name: "Reject" }).click(),
  ]);
  await pageA.waitForLoadState("networkidle");

  const deniedRecord = requireStoredConsent(
    await pageA.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  );
  expect(deniedRecord.choice).toBe("denied");
  expect(deniedRecord.receiptId).toMatch(/^[0-9a-f-]{36}$/i);

  const pageB = await context.newPage();
  await pageB.goto("/", { waitUntil: "networkidle" });
  await pageB.evaluate(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await nativeFetch(input, init);
      const body = typeof init?.body === "string" ? init.body : "";
      if (body.includes('"action":"grant"')) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
      return response;
    };
  });

  const laterWithdrawals: string[] = [];
  context.on("request", (request) => {
    const body = consentRequestBody(request);
    if (
      request.url().endsWith("/analytics-consent") &&
      body.action === "withdraw" &&
      body.receiptId
    ) {
      laterWithdrawals.push(body.receiptId);
    }
  });

  await pageA.getByRole("button", { name: "Cookie settings" }).click();
  await pageB.getByRole("button", { name: "Cookie settings" }).click();
  await pageB.getByRole("button", { name: "Accept analytics" }).click();
  await pageB.waitForTimeout(100);
  await pageA.getByRole("button", { name: "Accept analytics" }).click();
  await pageB.waitForTimeout(700);

  await expect(pageA.locator("#badseo-google-analytics")).toHaveCount(1);
  await expect(pageB.locator("#badseo-google-analytics")).toHaveCount(1);
  expect(laterWithdrawals).toEqual([]);
  const activeRecord = requireStoredConsent(
    await pageA.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  );
  expect(activeRecord).toMatchObject({
    choice: "granted",
    receiptId: deniedRecord.receiptId,
  });
});

test("invalidates grants for another property and remains operable when short", async ({
  context,
}) => {
  await context.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        choice: "granted",
        version: 2,
        noticeVersion: "2026-07-10.2",
        privacyPolicyVersion: "2026-07-10",
        measurementId: "G-OLDPROPERTY",
        receiptId: "123e4567-e89b-42d3-a456-426614174000",
        updatedAt: new Date().toISOString(),
      }),
    );
  }, STORAGE_KEY);

  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 320 });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.locator("#badseo-google-analytics")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBeNull();

  const panel = page.locator(".analytics-consent");
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(320);
  expect(
    await panel.evaluate((element) => getComputedStyle(element).overflowY),
  ).toBe("auto");
});
