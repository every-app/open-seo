const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "@playwright/test"
);
import fs from "node:fs/promises";
const stage = process.argv[2] || "before";
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const results = [];
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: theme,
  });
  await ctx.addInitScript(
    (t) => localStorage.setItem("theme-preference", t),
    theme,
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:4334/", {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page.screenshot({ path: `docs/reviews/TM-097/${stage}-${theme}.png` });
  results.push({
    theme,
    url: page.url(),
    title: await page.title(),
    text: (await page.locator("body").innerText()).slice(0, 1500),
    errors,
    styles: await page.evaluate(() => {
      const r = getComputedStyle(document.documentElement);
      const b = document.querySelector(".btn-primary");
      return {
        theme: document.documentElement.dataset.theme,
        bdTheme: document.documentElement.dataset.bdTheme,
        primary: r.getPropertyValue("--color-primary"),
        base: r.getPropertyValue("--color-base-200"),
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        button: b ? getComputedStyle(b).backgroundColor : null,
        font: getComputedStyle(document.body).fontFamily,
        scrollWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
      };
    }),
  });
  await ctx.close();
}
await fs.writeFile(
  `docs/reviews/TM-097/${stage}.json`,
  JSON.stringify(results, null, 2) + "\n",
);
await browser.close();
