import { expect, test } from "@playwright/test";

test("Back after the OpenSEO link returns to the previous project page", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForURL(/\/p\/[^/]+\/?$/, { timeout: 30_000 });
  const dashboardUrl = page.url();

  await page.goto(`${dashboardUrl.replace(/\/$/, "")}/keywords`);
  const keywordsUrl = page.url();

  await page.getByRole("link", { name: "OpenSEO", exact: true }).click();
  await page.waitForURL(dashboardUrl);

  await page.goBack();
  await expect(page).toHaveURL(keywordsUrl);
});
