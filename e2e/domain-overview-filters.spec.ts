import { expect, test } from "@playwright/test";
import {
  applyFilters,
  ensureFiltersOpen,
  expectPageResponsive,
  openDomainOverview,
  PRIMARY_TEST_DOMAIN,
  SECONDARY_TEST_DOMAIN,
  openFilters,
  switchDomainTab,
  typeIntoDraftInput,
} from "./domain-overview-test-utils";

test.describe("Domain Overview filters", () => {
  test("closing an inactive search tab does not select it", async ({
    page,
  }) => {
    await openDomainOverview(page, "keywords");
    const firstUrl = new URL(page.url());

    const secondUrl = new URL(page.url());
    secondUrl.searchParams.set("domain", SECONDARY_TEST_DOMAIN);
    await page.goto(secondUrl.toString());
    await expect(
      page.getByRole("tab", { name: SECONDARY_TEST_DOMAIN }),
    ).toHaveAttribute("aria-selected", "true");

    const inactiveCloseButton = page.getByRole("button", {
      name: `Close ${PRIMARY_TEST_DOMAIN} tab`,
    });
    await inactiveCloseButton.click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get("domain"))
      .toBe(SECONDARY_TEST_DOMAIN);
    await expect(
      page.getByRole("tab", { name: SECONDARY_TEST_DOMAIN }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("tab", { name: PRIMARY_TEST_DOMAIN }),
    ).toHaveCount(0);
    expect(firstUrl.searchParams.get("domain")).toBe(PRIMARY_TEST_DOMAIN);
  });

  test("closing the active search tab removes it and selects the neighbor", async ({
    page,
  }) => {
    await openDomainOverview(page, "keywords");

    const secondUrl = new URL(page.url());
    secondUrl.searchParams.set("domain", SECONDARY_TEST_DOMAIN);
    await page.goto(secondUrl.toString());
    await expect(
      page.getByRole("tab", { name: SECONDARY_TEST_DOMAIN }),
    ).toHaveAttribute("aria-selected", "true");

    const activeCloseButton = page.getByRole("button", {
      name: `Close ${SECONDARY_TEST_DOMAIN} tab`,
    });
    const closedTabId =
      await activeCloseButton.getAttribute("data-search-tab-id");
    expect(closedTabId).toBeTruthy();

    await activeCloseButton.click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get("domain"))
      .toBe(PRIMARY_TEST_DOMAIN);
    await expect(
      page.getByRole("tab", { name: PRIMARY_TEST_DOMAIN }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.locator(`[data-search-tab-id="${closedTabId}"]`),
    ).toHaveCount(0);
  });

  test("keyword filters stay responsive after applying Traffic min and editing Volume max", async ({
    page,
  }) => {
    await openDomainOverview(page, "keywords");

    await openFilters(page);
    await typeIntoDraftInput(
      page,
      page.getByPlaceholder("Min").nth(0),
      "10",
      "Traffic min",
    );
    await applyFilters(page);

    await ensureFiltersOpen(page, "Include Terms");
    await typeIntoDraftInput(
      page,
      page.getByPlaceholder("Max").nth(1),
      "5000",
      "Volume max",
    );

    await expect(page.getByText("unapplied")).toBeVisible();
    await expectPageResponsive(page, "after editing Volume max");
  });

  test("page filters stay responsive after applying Traffic min and editing Keywords max", async ({
    page,
  }) => {
    await openDomainOverview(page, "pages");

    await openFilters(page);
    await typeIntoDraftInput(
      page,
      page.getByPlaceholder("Min").nth(0),
      "10",
      "Traffic min",
    );
    await applyFilters(page, "pMinTraffic", "10");

    await ensureFiltersOpen(page, "Include Page Terms");
    await typeIntoDraftInput(
      page,
      page.getByPlaceholder("Max").nth(1),
      "50",
      "Keywords max",
    );

    await expect(page.getByText("unapplied")).toBeVisible();
    await expectPageResponsive(page, "after editing Keywords max");
  });

  test("clearing page filters does not clear keyword filters", async ({
    page,
  }) => {
    await openDomainOverview(page, "keywords");

    await openFilters(page);
    await typeIntoDraftInput(
      page,
      page.getByPlaceholder("Min").nth(0),
      "10",
      "Keyword traffic min",
    );
    await applyFilters(page, "minTraffic", "10");

    await switchDomainTab(page, "pages");
    await openFilters(page);
    await typeIntoDraftInput(
      page,
      page.getByPlaceholder("Min").nth(0),
      "20",
      "Page traffic min",
    );
    await applyFilters(page, "pMinTraffic", "20");

    await ensureFiltersOpen(page, "Include Page Terms");
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("pMinTraffic"))
      .toBe(null);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("minTraffic"))
      .toBe("10");
    await expectPageResponsive(page, "after clearing page filters");

    const keywordUrl = new URL(page.url());
    keywordUrl.searchParams.delete("tab");
    await page.goto(keywordUrl.toString());
    await ensureFiltersOpen(page, "Include Terms");
    await expect(page.getByPlaceholder("Min").nth(0)).toHaveValue("10");
  });

  test("submitting a new domain clears the previous domain filters", async ({
    page,
  }) => {
    await openDomainOverview(page, "pages");

    await openFilters(page);
    await typeIntoDraftInput(
      page,
      page.getByPlaceholder("Min").nth(0),
      "20",
      "Page traffic min",
    );
    await applyFilters(page, "pMinTraffic", "20");

    const domainInput = page.getByPlaceholder("Enter a domain").first();
    await domainInput.click();
    await domainInput.press(
      process.platform === "darwin" ? "Meta+A" : "Control+A",
    );
    await domainInput.press("Backspace");
    await domainInput.pressSequentially(SECONDARY_TEST_DOMAIN);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get("domain"))
      .toBe(SECONDARY_TEST_DOMAIN);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("pMinTraffic"))
      .toBe(null);
    await ensureFiltersOpen(page, "Include Page Terms");
    await expect(page.getByPlaceholder("Min").nth(0)).toHaveValue("");
    await expectPageResponsive(page, "after submitting a new domain");
  });

  test("saved filter defaults apply only when the URL has no tab filters", async ({
    page,
  }) => {
    await openDomainOverview(page, "pages");

    await openFilters(page);
    await typeIntoDraftInput(
      page,
      page.getByPlaceholder("Min").nth(0),
      "20",
      "Page traffic min",
    );
    await applyFilters(page, "pMinTraffic", "20");

    const urlWithoutPageFilters = new URL(page.url());
    urlWithoutPageFilters.searchParams.delete("pMinTraffic");
    await page.goto(urlWithoutPageFilters.toString());
    await ensureFiltersOpen(page, "Include Page Terms");
    await expect(page.getByPlaceholder("Min").nth(0)).toHaveValue("20");
    expect(new URL(page.url()).searchParams.get("pMinTraffic")).toBe(null);

    const urlWithExplicitPageFilters = new URL(page.url());
    urlWithExplicitPageFilters.searchParams.set("pMinTraffic", "30");
    await page.goto(urlWithExplicitPageFilters.toString());
    await ensureFiltersOpen(page, "Include Page Terms");
    await expect(page.getByPlaceholder("Min").nth(0)).toHaveValue("30");
  });
});
