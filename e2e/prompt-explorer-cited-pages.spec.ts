import { expect, test, type Page } from "@playwright/test";

async function getProjectId(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/p\/([^/]+)\//, { timeout: 30_000 });
  const match = page.url().match(/\/p\/([^/]+)\//);
  if (!match) throw new Error(`Could not read project id from ${page.url()}`);
  return match[1];
}

test.describe("Prompt Explorer Cited pages", () => {
  test("aggregates citations across models into the Cited pages tab", async ({
    page,
  }) => {
    const projectId = await getProjectId(page);

    await page.goto(
      `/p/${projectId}/prompt-explorer?q=${encodeURIComponent(
        "best vitamin c serum for sensitive skin",
      )}&hb=${encodeURIComponent("Glow Cosmetics")}`,
    );

    const citedTab = page.getByRole("tab", { name: "Cited pages" });
    await expect(citedTab).toBeVisible({ timeout: 30_000 });

    // The "add your DataForSEO key" nudge can pop in over the results a beat
    // after they load, so wait for it and dismiss it before clicking the tab.
    await page
      .getByRole("button", { name: "Dismiss" })
      .click({ timeout: 10_000 })
      .catch(() => {});

    await citedTab.click();

    // Brand-matched source cited by both GPT 5 and Claude.
    await expect(
      page.getByText("Glow Cosmetics Vitamin C Serum"),
    ).toBeVisible();
    // A source cited by two different models collapses to one row.
    await expect(
      page.getByText("The 12 Best Vitamin C Serums of 2026"),
    ).toBeVisible();

    // Hide the dev-only TanStack devtools widget so the demo image is clean.
    await page.addStyleTag({
      content:
        '[class*="Devtools"], [class*="devtools"], [aria-label*="TanStack" i], [aria-label*="devtools" i] { display: none !important; }',
    });

    const citedTable = page.getByRole("table");
    await citedTable.scrollIntoViewIfNeeded();
    await citedTable.screenshot({
      path: "e2e/artifacts/prompt-explorer-cited-pages.png",
    });
  });
});
