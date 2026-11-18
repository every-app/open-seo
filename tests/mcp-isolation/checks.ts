import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";

type Check = {
  chapter: string;
  credential: string;
  tool: string;
  expectation: string;
  outcome: "pass" | "fail";
  detail: string;
};

const checks: Check[] = [];

/**
 * Records one verdict for the report and asserts it softly, so a failing cell
 * of the cross-tenant matrix still lets the rest of the matrix run and show up
 * in the table.
 */
export function check(input: Omit<Check, "outcome"> & { ok: boolean }) {
  const { ok, ...rest } = input;
  const entry: Check = { ...rest, outcome: ok ? "pass" : "fail" };
  checks.push(entry);
  expect
    .soft(
      ok,
      `[${entry.chapter}] ${entry.credential} / ${entry.tool}: ${entry.expectation} (${entry.detail})`,
    )
    .toBe(true);
}

function cell(value: string) {
  const flat = value.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}...` : flat;
}

/** Writes every recorded check as a markdown table (creates the directory). */
export async function writeReport(
  filePath: string,
  header: Record<string, string>,
) {
  const failed = checks.filter((entry) => entry.outcome === "fail").length;
  const lines = [
    "# MCP tenant isolation report",
    "",
    ...Object.entries(header).map(([key, value]) => `- ${key}: ${value}`),
    `- Checks: ${checks.length} (${checks.length - failed} pass, ${failed} fail)`,
    "",
    "| Chapter | Credential | Tool | Expectation | Outcome | Detail |",
    "| --- | --- | --- | --- | --- | --- |",
    ...checks.map(
      (entry) =>
        `| ${cell(entry.chapter)} | ${cell(entry.credential)} | ${cell(entry.tool)} | ${cell(entry.expectation)} | ${entry.outcome} | ${cell(entry.detail)} |`,
    ),
    "",
  ];
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, lines.join("\n"), "utf8");
}
