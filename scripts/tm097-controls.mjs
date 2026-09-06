const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "@playwright/test"
);
import fs from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const checks = [];
for (const theme of ["light", "dark"]) {
  const c = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: theme === "light" ? "dark" : "light",
  });
  await c.addInitScript(
    (t) => localStorage.setItem("theme-preference", t),
    theme,
  );
  const p = await c.newPage();
  await p.goto("http://localhost:4334/", {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  const state = await p.evaluate(() => {
    const r = document.documentElement;
    return {
      bd: r.dataset.bdTheme,
      daisy: r.dataset.theme,
      blue: getComputedStyle(r).getPropertyValue("--bd-interactive-blue"),
      font: document.fonts.check('16px "IBM Plex Sans"'),
    };
  });
  checks.push({
    theme,
    check: "saved preference overrides opposite OS in both theme layers",
    pass:
      state.bd === theme &&
      state.daisy === (theme === "dark" ? "openseo-dark" : "openseo"),
    state,
  });
  const dismiss = p
    .getByRole("button", { name: "Dismiss", exact: true })
    .last();
  await dismiss.click();
  checks.push({
    theme,
    check: "setup dialog dismisses",
    pass: !(await p
      .getByText("One quick setup step", { exact: true })
      .isVisible()),
  });
  await p.screenshot({ path: `docs/reviews/TM-097/dashboard-${theme}.png` });
  await p.keyboard.press("Tab");
  const focus = await p.evaluate(() => ({
    tag: document.activeElement.tagName,
    role: document.activeElement.getAttribute("role"),
    tabIndex: document.activeElement.tabIndex,
    html: document.activeElement.outerHTML.slice(0, 400),
  }));
  checks.push({
    theme,
    check: "keyboard focus reaches an interactive element",
    pass: focus.tabIndex >= 0 && focus.tag !== "BODY",
    focus,
  });
  await p.getByRole("link", { name: "Settings", exact: true }).last().click();
  await p.waitForTimeout(600);
  checks.push({
    theme,
    check: "Settings navigation",
    pass: new URL(p.url()).pathname === "/settings",
  });
  await c.close();
}
await fs.writeFile(
  "docs/reviews/TM-097/controls.json",
  JSON.stringify(checks, null, 2) + "\n",
);
await browser.close();
if (checks.some((x) => !x.pass)) process.exitCode = 1;
