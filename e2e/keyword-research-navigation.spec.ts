import { expect, test, type Page } from "@playwright/test";

async function getProjectId(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/p\/([^/]+)\/keywords(?:\?.*)?$/, {
    timeout: 30_000,
  });

  const match = page.url().match(/\/p\/([^/]+)\/keywords/);
  if (!match) throw new Error(`Could not read project id from ${page.url()}`);
  return match[1];
}

test.describe("Keyword Research navigation", () => {
  test("Back to Recent searches clears the active keyword tab query", async ({
    page,
  }) => {
    const projectId = await getProjectId(page);

    await page.goto(
      `/p/${projectId}/keywords?q=keyword%20research&loc=2840&kLimit=150&mode=auto`,
    );
    await expect(
      page.getByRole("heading", { name: "Keyword Research", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: /keyword research/i }).first(),
    ).toBeVisible({ timeout: 30_000 });
    const recentSearchesButton = page.locator(
      '[data-testid="keyword-research-recent-searches"]:visible',
    );
    await expect(recentSearchesButton).toBeVisible();

    await recentSearchesButton.click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe(null);
    await expect(
      page.getByRole("link", { name: "keyword research US" }),
    ).toBeVisible();
    await expect(recentSearchesButton).toBeHidden();
  });

  test("clicking keyword tabs keeps the clicked tab and URL in sync", async ({
    page,
  }) => {
    const projectId = await getProjectId(page);

    await page.goto(
      `/p/${projectId}/keywords?q=keyword%20research&loc=2840&kLimit=150&mode=auto`,
    );
    await expect(
      page.getByRole("row", { name: /keyword research/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await page.goto(
      `/p/${projectId}/keywords?q=backlinks&loc=2840&kLimit=150&mode=auto`,
    );
    await expect(
      page.getByRole("row", { name: /backlinks/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("tab", { name: /keyword research/i }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe("keyword research");
    await expect(
      page.getByRole("row", { name: /keyword research/i }).first(),
    ).toBeVisible();

    await page.getByRole("tab", { name: /^backlinks/i }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe("backlinks");
    await expect(
      page.getByRole("row", { name: /backlinks/i }).first(),
    ).toBeVisible();
  });

  test("closing the active middle keyword tab removes it and selects the next tab", async ({
    page,
  }) => {
    const projectId = await getProjectId(page);

    for (const keyword of ["ai seo", "backlinks", "open seo"]) {
      await page.goto(
        `/p/${projectId}/keywords?q=${encodeURIComponent(keyword)}&loc=2840&kLimit=150&mode=auto`,
      );
      await expect(
        page.getByRole("row", { name: new RegExp(keyword, "i") }).first(),
      ).toBeVisible({ timeout: 30_000 });
    }

    await page.getByRole("tab", { name: /^backlinks/i }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe("backlinks");

    const closeButton = page.getByRole("button", {
      name: "Close backlinks tab",
    });
    const closedTabId = await closeButton.getAttribute("data-search-tab-id");
    expect(closedTabId).toBeTruthy();

    await closeButton.click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe("open seo");
    await expect(page.getByRole("tab", { name: /^open seo/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.locator(`[data-search-tab-id="${closedTabId}"]`),
    ).toHaveCount(0);
    // Count only search tabs: the app shell has grown other tablists
    // (Browse/Chat), so a bare role=tab count would include them.
    await expect(
      page.getByRole("tablist", { name: "Search tabs" }).getByRole("tab"),
    ).toHaveCount(2);
  });
});
