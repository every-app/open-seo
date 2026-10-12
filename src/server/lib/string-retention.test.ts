import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("retained string memory", () => {
  it.each(["scraped text", "tool output"])(
    "releases the large source behind %s",
    (scenario) => {
      // Isolate GC from Vitest's heap. Each result must outlive its independently
      // allocated source, just as queued pages and transcript entries do.
      const result = spawnSync(
        process.execPath,
        [
          "--expose-gc",
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
          import assert from "node:assert/strict";
          import { readPages } from ${JSON.stringify(new URL("./scrape.ts", import.meta.url).href)};
          import { capToolOutput } from ${JSON.stringify(new URL("../features/sam/samToolOutput.ts", import.meta.url).href)};
          const scenario = ${JSON.stringify(scenario)};
          const title = "Example memory regression 🌱";
          globalThis.fetch = async () => {
            const bytes = new TextEncoder().encode(
              "<title>" + title + "</title><body>" +
              "sample words ".repeat(100_000) + "</body>");
            let offset = 0;
            return new Response(new ReadableStream({
              pull(controller) {
                if (offset >= bytes.length) return controller.close();
                controller.enqueue(bytes.subarray(offset, offset + 65536));
                offset += 65536;
              },
            }), { headers: { "content-type": "text/html" } });
          };
          const makeResult = async () => {
            if (scenario === "scraped text") {
              // Documentation-only IP avoids DNS; fetch is fully stubbed.
              const result = await readPages(["https://192.0.2.1/example"]);
              assert.equal(result.blocked, false);
              assert.equal(result.pages[0].title, title);
              assert.ok(result.pages[0].text.length <= 4000);
              return result;
            }
            const input = { pages: [{ text: new TextDecoder().decode(
              new TextEncoder().encode("x".repeat(1_500_000))) }] };
            const budget = 2000;
            const result = capToolOutput(input, budget);
            assert.ok(JSON.stringify(result).length <= budget);
            assert.equal(input.pages[0].text.length, 1_500_000);
            assert.ok(result.pages[0].text.length <= 8000);
            assert.ok(result.truncated.includes("shortened"));
            return result;
          };
          const collect = async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
            globalThis.gc();
            globalThis.gc();
            const { heapUsed, external } = process.memoryUsage();
            return heapUsed + external;
          };
          await makeResult();
          const before = await collect();
          const results = [];
          for (let i = 0; i < 40; i++) results.push(await makeResult());
          const retained = (await collect()) - before;
          assert.equal(results.length, 40);
          assert.ok(retained < 16 * 1024 * 1024,
            scenario + " retained " + retained + " bytes of source strings");
        `,
        ],
        { encoding: "utf8", timeout: 20_000 },
      );

      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
    },
    25_000,
  );
});
