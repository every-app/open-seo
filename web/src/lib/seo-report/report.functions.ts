import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import type { SeoReportEnv } from "./config";
import { readReport } from "./read";

export const getSeoReport = createServerFn({ method: "GET" })
  .inputValidator((token: string) => token)
  .handler(async ({ data: token }) => {
    const report = await readReport(env as unknown as SeoReportEnv, token);
    if (!report) throw notFound();
    return report;
  });
