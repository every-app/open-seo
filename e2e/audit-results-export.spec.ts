import { expect, test, type Page } from "@playwright/test";

async function openCompletedAudit(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/p\/([^/]+)\/?$/, { timeout: 30_000 });
  const projectId = page.url().match(/\/p\/([^/]+)/)?.[1];
  if (!projectId)
    throw new Error(`Could not read project id from ${page.url()}`);

  await page.goto(`/p/${projectId}/audit?auditId=audit-results-e2e`);
  await expect(page.getByRole("tab", { name: "Issues (1)" })).toBeVisible();
  const dismissButton = page.getByRole("button", { name: "Dismiss" });
  if (await dismissButton.isVisible()) {
    await dismissButton.click();
  }
}

test("audit Export menu does not block result tabs or dismissal", async ({
  page,
}) => {
  await openCompletedAudit(page);

  const exportButton = page.getByRole("button", { name: "Export" });
  const assertTabSelectsThroughOpenMenu = async (name: string) => {
    await exportButton.click();
    await expect(page.getByRole("menu")).toBeVisible();
    const tab = page.getByRole("tab", { name });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("menu")).toHaveCount(0);
  };

  await assertTabSelectsThroughOpenMenu("Pages (1)");
  await assertTabSelectsThroughOpenMenu("Performance (1)");
  await assertTabSelectsThroughOpenMenu("Issues (1)");

  await exportButton.click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "CSV" }).click();
  await download;
  await expect(page.getByRole("menu")).toHaveCount(0);

  await exportButton.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(exportButton).toBeFocused();

  await exportButton.click();
  await page.getByRole("heading", { name: "audit.example.com" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
});
