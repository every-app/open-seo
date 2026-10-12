import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";

const workflow = z
  .object({
    jobs: z.object({
      preview: z.object({
        steps: z.array(
          z.object({ name: z.string(), run: z.string().optional() }),
        ),
      }),
    }),
  })
  .parse(parse(readFileSync(".github/workflows/pr-preview.yml", "utf8")));
const script = workflow.jobs.preview.steps.find(
  (step) => step.name === "Verify Access protection",
)?.run;
if (!script) throw new Error("Preview Access verification step is missing");

const access = "302 https://example.cloudflareaccess.com/cdn-cgi/access/login";

describe("preview Access verification", () => {
  it.each([
    { responses: [access], status: 0, retries: 0 },
    { responses: ["404 ", access], status: 0, retries: 1 },
    { responses: ["503 ", access], status: 0, retries: 1 },
    { responses: ["000 ", access], status: 0, retries: 1 },
    { responses: ["200 "], status: 1, retries: 0 },
    { responses: ["302 https://example.com/"], status: 1, retries: 0 },
    { responses: ["403 "], status: 1, retries: 0 },
    { responses: ["404 ", "200 "], status: 1, retries: 1 },
    { responses: Array<string>(8).fill("404 "), status: 1, retries: 8 },
  ])("handles $responses", ({ responses, status, retries }) => {
    const directory = mkdtempSync(join(tmpdir(), "preview-access-"));
    try {
      const responseFile = join(directory, "responses");
      writeFileSync(responseFile, responses.join("\n") + "\n");
      const result = spawnSync(
        "bash",
        [
          "-c",
          // A shared file descriptor advances even inside curl's command substitution.
          `exec 3< "$PREVIEW_RESPONSES"
curl() { local response; IFS= read -r response <&3 || response="000 "; printf '%s\\n' "$response"; }
sleep() { :; }
${script}`,
        ],
        {
          encoding: "utf8",
          timeout: 5000,
          env: {
            ...process.env,
            PREVIEW_URL: "https://preview.example.invalid",
            STAGE: "test",
            PREVIEW_RESPONSES: responseFile,
          },
        },
      );

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(status);
      expect(result.stdout.match(/attempt \d:/g) ?? []).toHaveLength(retries);
      if (retries === 8) {
        expect(result.stdout).toContain("Could not verify");
        expect(result.stdout).not.toContain("preview is public");
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
