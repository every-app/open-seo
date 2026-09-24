// Exercises the real Durable Object in workerd without any provider requests.
const { createRequire } = require("node:module");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const assert = require("node:assert/strict");
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare } = wranglerRequire("miniflare");
const { build } = wranglerRequire("esbuild");

(async () => {
  const root = path.resolve(__dirname, "..");
  const built = await build({
    stdin: {
      contents: `export { FreeToolBudget } from './src/lib/free-tools/budget';
   export default { async fetch(request, env) {
    const { group, ...input } = await request.json();
    return Response.json(await env.FREE_TOOL_BUDGET.getByName(group).reserve(input));
   }};`,
      resolveDir: root,
      sourcefile: "budget-harness.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    external: ["cloudflare:workers"],
  });
  const persist = await fs.mkdtemp(path.join(os.tmpdir(), "seoshark-budget-"));
  const options = {
    modules: true,
    script: built.outputFiles[0].text,
    compatibilityDate: "2026-02-19",
    bindings: { FREE_TOOLS_DAILY_BUDGET_USD: "1.00" },
    durableObjects: {
      FREE_TOOL_BUDGET: { className: "FreeToolBudget", useSQLite: true },
    },
    durableObjectsPersist: persist,
  };
  let mf = new Miniflare(options);
  const day = new Date().toISOString().slice(0, 10);
  async function reserve(group, visitor, calls = 2, tool = "backlink-checker") {
    const result = await mf.dispatchFetch("https://budget.test/", {
      method: "POST",
      body: JSON.stringify({
        group,
        visitor: visitor.toString(16).padStart(64, "0"),
        calls,
        tool,
        day,
      }),
    });
    assert.equal(result.status, 200);
    return result.json();
  }
  try {
    const burst = await Promise.all(
      Array.from({ length: 50 }, (_, i) => reserve("burst", i)),
    );
    assert.equal(burst.filter((x) => x === "allowed").length, 20);
    assert.equal(burst.filter((x) => x === "daily").length, 30);
    for (let i = 0; i < 6; i++)
      assert.equal(await reserve("ip", 1, 6, "keyword-generator"), "allowed");
    assert.equal(await reserve("ip", 1, 6, "keyword-generator"), "visitor");
    assert.equal(await reserve("ip", 1, 4, "keyword-generator"), "allowed");
    assert.equal(await reserve("ip", 1, 1, "keyword-generator"), "visitor");
    assert.equal(await reserve("ip", 2, 1, "keyword-generator"), "allowed");
    await mf.dispose();
    mf = new Miniflare(options);
    assert.equal(await reserve("burst", 999), "daily");
    console.log(
      "PASS: 50 concurrent reservations cannot exceed budget; whole-run IP limit, rejected-reservation rollback, and persisted limits after restart.",
    );
  } finally {
    await mf.dispose();
    await fs.rm(persist, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
