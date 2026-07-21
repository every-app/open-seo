import { writeFile } from "node:fs/promises";
import {
  expect,
  type CDPSession,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

// Real .com suffix on purpose: form-submit validation (isValidDomainHost via
// tldts) rejects the reserved .example TLD, and these constants reach the one
// test that submits through the real form instead of URL navigation.
export const PRIMARY_TEST_DOMAIN = "primary.example.com";
export const SECONDARY_TEST_DOMAIN = "secondary.example.com";
const RESPONSIVE_TIMEOUT_MS = 1_500;
const INPUT_LATENCY_BUDGET_MS = 8_000;

type DomainTab = "keywords" | "pages";

type DomainLongTask = {
  name: string;
  startTime: number;
  duration: number;
};

type DomainRafGap = {
  startTime: number;
  duration: number;
};

type DomainInputEvent = {
  label: string;
  duration: number;
  time: number;
};

type DomainPerfState = {
  startedAt: number;
  longTasks: DomainLongTask[];
  rafGaps: DomainRafGap[];
  maxRafGap: number;
  inputEvents: DomainInputEvent[];
  errors: string[];
};

type WindowWithDomainPerf = Window &
  typeof globalThis & {
    __domainPerf?: DomainPerfState;
  };

export type DomainPerfMetrics = DomainPerfState & {
  url: string;
  userAgent: string;
  maxLongTaskDuration: number;
  totalLongTaskDuration: number;
  maxInputDuration: number;
};

export async function installDomainPerfProbe(page: Page) {
  await page.addInitScript(() => {
    const state: DomainPerfState = {
      startedAt: performance.now(),
      longTasks: [],
      rafGaps: [],
      maxRafGap: 0,
      inputEvents: [],
      errors: [],
    };
    const win = window as WindowWithDomainPerf;
    win.__domainPerf = state;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
          });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      // Long Tasks are Chromium-only. The rest of the probe still catches stalls.
    }

    let lastFrame = performance.now();
    const tick = (now: number) => {
      const gap = now - lastFrame;
      state.maxRafGap = Math.max(state.maxRafGap, gap);
      if (gap > 100) {
        state.rafGaps.push({ startTime: lastFrame, duration: gap });
      }
      lastFrame = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    window.addEventListener("error", (event) => {
      state.errors.push(event.message);
    });
    window.addEventListener("unhandledrejection", (event) => {
      state.errors.push(String(event.reason));
    });
  });
}

export async function resetDomainPerfMetrics(page: Page) {
  await page.evaluate(() => {
    const state = (window as WindowWithDomainPerf).__domainPerf;
    if (!state) return;
    state.startedAt = performance.now();
    state.longTasks = [];
    state.rafGaps = [];
    state.maxRafGap = 0;
    state.inputEvents = [];
    state.errors = [];
  });
}

export async function getDomainPerfMetrics(
  page: Page,
): Promise<DomainPerfMetrics> {
  return page.evaluate(() => {
    const state = (window as WindowWithDomainPerf).__domainPerf;
    if (!state) {
      throw new Error("Domain perf probe was not installed");
    }

    return {
      ...state,
      url: window.location.href,
      userAgent: navigator.userAgent,
      maxLongTaskDuration: Math.max(
        0,
        ...state.longTasks.map((entry) => entry.duration),
      ),
      totalLongTaskDuration: state.longTasks.reduce(
        (total, entry) => total + entry.duration,
        0,
      ),
      maxInputDuration: Math.max(
        0,
        ...state.inputEvents.map((entry) => entry.duration),
      ),
    };
  });
}

export async function attachDomainPerfMetrics(
  testInfo: TestInfo,
  metrics: DomainPerfMetrics,
) {
  await attachJsonArtifact(testInfo, "domain-filter-perf.json", metrics);
}

export async function attachJsonArtifact(
  testInfo: TestInfo,
  name: string,
  value: unknown,
) {
  const outputPath = testInfo.outputPath(name);
  await writeFile(outputPath, JSON.stringify(value, null, 2));
  await testInfo.attach(name, {
    path: outputPath,
    contentType: "application/json",
  });
}

export async function openDomainOverview(page: Page, tab: DomainTab) {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("domain-overview-e2e-cleared") === "1") {
      return;
    }
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("domain-overview-filter-defaults:")) {
        window.localStorage.removeItem(key);
      }
    }
    window.sessionStorage.setItem("domain-overview-e2e-cleared", "1");
  });
  await page.goto("/");
  await page.waitForURL(/\/p\/([^/]+)\/keywords(?:\?.*)?$/, {
    timeout: 30_000,
  });

  const match = page.url().match(/\/p\/([^/]+)\/keywords/);
  if (!match) throw new Error(`Could not read project id from ${page.url()}`);

  const params = new URLSearchParams({
    domain: PRIMARY_TEST_DOMAIN,
    subdomains: "true",
    sort: "traffic",
    order: "desc",
  });
  if (tab === "pages") params.set("tab", "pages");

  await page.goto(`/p/${match[1]}/domain?${params.toString()}`);
  await expect(
    page.getByRole("heading", { name: "Domain Overview" }),
  ).toBeVisible();
  await dismissSetupModal(page);
  await expect(page.getByRole("button", { name: /Filters/ })).toBeVisible({
    timeout: 30_000,
  });
  await expectPageResponsive(page, "after opening Domain Overview");
}

async function dismissSetupModal(page: Page) {
  const dismissButton = page.getByRole("button", { name: "Dismiss" });
  if (await dismissButton.isVisible()) {
    await dismissButton.click();
  }
}

export async function waitForDomainRows(page: Page, label: string) {
  const marker = label.includes("Pages")
    ? page.getByRole("link", { name: /\/section-a\/page-001/ }).first()
    : page
        .getByRole("row", {
          name: /primary sample query.*\/section-a\/page-001/,
        })
        .first();
  await expect(marker, label).toBeVisible({ timeout: 30_000 });
  await expectPageResponsive(page, `after table rows loaded for ${label}`);
}

export async function switchDomainTab(page: Page, tab: DomainTab) {
  const label = tab === "keywords" ? "Top Keywords" : "Top Pages";
  await page.getByRole("tab", { name: label }).click();
  await expect(page.getByRole("tab", { name: label })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expectPageResponsive(page, `after switching to ${label}`);
}

export async function openFilters(page: Page) {
  await page.getByRole("button", { name: /Filters/ }).click();
  await expect(page.getByText("Refine table results")).toBeVisible();
  await expectPageResponsive(page, "after opening filters");
}

export async function closeFilters(page: Page) {
  await page.getByRole("button", { name: /Filters/ }).click();
  await expect(page.getByText("Refine table results")).toBeHidden();
  await expectPageResponsive(page, "after closing filters");
}

export async function ensureFiltersOpen(page: Page, expectedLabel: string) {
  if (!(await page.getByText(expectedLabel).isVisible())) {
    await openFilters(page);
  }
  await expect(page.getByText(expectedLabel)).toBeVisible();
}

export async function applyFilters(
  page: Page,
  expectedParam = "minTraffic",
  expectedValue = "10",
) {
  await page.getByRole("button", { name: /Apply filters/ }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get(expectedParam))
    .toBe(expectedValue);
  await expect(page.getByRole("button", { name: /Filters/ })).toContainText(
    "1",
  );
  await expectPageResponsive(page, "after applying filters");
}

export async function typeIntoDraftInput(
  page: Page,
  input: Locator,
  value: string,
  label: string,
  options?: {
    actionTimeoutMs?: number;
    cdpSession?: CDPSession;
    inputLatencyBudgetMs?: number;
    recordPerf?: boolean;
  },
) {
  const actionTimeout = options?.actionTimeoutMs ?? 5_000;
  const budget = options?.inputLatencyBudgetMs ?? INPUT_LATENCY_BUDGET_MS;
  const started = Date.now();
  await input.click({ timeout: actionTimeout });
  if (options?.cdpSession) {
    await withTimeout(
      input.evaluate((element) => {
        if (!(element instanceof HTMLInputElement)) {
          throw new Error("Expected a text input");
        }
        element.value = "";
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }),
      actionTimeout,
      `Input clear did not settle for ${label}`,
    );
  } else {
    await input.press(process.platform === "darwin" ? "Meta+A" : "Control+A", {
      timeout: actionTimeout,
    });
    await input.press("Backspace", { timeout: actionTimeout });
  }

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    const keyStarted = Date.now();
    if (options?.cdpSession) {
      await withTimeout(
        options.cdpSession.send("Input.dispatchKeyEvent", {
          type: "char",
          text: char,
        }),
        actionTimeout,
        `CDP input did not settle for ${label} char ${index + 1}`,
      );
    } else {
      await input.press(char, { timeout: actionTimeout });
    }
    const keyDuration = Date.now() - keyStarted;
    if (options?.recordPerf) {
      await recordInputLatency(page, `${label} char ${index + 1}`, keyDuration);
    }
    await expectPageResponsive(page, `after typing ${label}`);
  }

  const duration = Date.now() - started;
  if (options?.recordPerf) {
    await recordInputLatency(page, label, duration);
  }
  expect(duration, `${label} input latency`).toBeLessThan(budget);
}

export async function expectPageResponsive(page: Page, label: string) {
  await withTimeout(
    page.evaluate(() => document.body.textContent?.includes("Domain Overview")),
    RESPONSIVE_TIMEOUT_MS,
    `Page did not respond ${label}`,
  );
}

async function recordInputLatency(page: Page, label: string, duration: number) {
  await page.evaluate(
    ({ label: eventLabel, duration: eventDuration }) => {
      const state = (window as WindowWithDomainPerf).__domainPerf;
      state?.inputEvents.push({
        label: eventLabel,
        duration: eventDuration,
        time: performance.now(),
      });
    },
    { label, duration },
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
