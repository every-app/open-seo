import { expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  env: {},
  DurableObject: class {},
}));
vi.mock("../src/lib/seo-report/removed-sites.json", () => ({
  default: ["example.org"],
}));
import type { SeoReportEnv } from "../src/lib/seo-report/config";
import { readReport } from "../src/lib/seo-report/read";
import { report } from "./seo-report-support";

// What a link to a report answers.

const TOKEN = "0123456789abcdef0123456789abcdef";
const read = vi.fn(async (_: string) => report("example.com"));
const env = {
  SEO_REPORT_DESK: { idFromName: () => "desk", get: () => ({ report: read }) },
} as unknown as SeoReportEnv;

it("serves a report by its token, and looks nothing else up", async () => {
  expect(await readReport(env, TOKEN)).toMatchObject({ site: "example.com" });
  expect(await readReport(env, "../../etc/passwd")).toBeNull();
  expect(await readReport(env, TOKEN.toUpperCase())).toBeNull();
  expect(read).toHaveBeenCalledTimes(1);
});

it("stops serving the report of a site that was removed, and of every name under it", async () => {
  read.mockResolvedValue(report("app.example.org"));
  expect(await readReport(env, TOKEN)).toBeNull();
});
