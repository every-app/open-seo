#!/usr/bin/env node

// @ts-check

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const argv = process.argv.slice(2);
const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;

const { values } = parseArgs({
  args: normalizedArgv,
  options: {
    "dry-run": { type: "boolean", default: false },
  },
  allowPositionals: false,
});

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const packageJsonPath = path.join(repoRoot, "package.json");
/** @type {unknown} */
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

if (!packageJson || typeof packageJson !== "object") {
  throw new Error("package.json must contain an object");
}

const version = Reflect.get(packageJson, "version");
if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Invalid package version: ${String(version)}`);
}

const tag = `v${version}`;
const notesFile = `release-notes/${tag}.md`;
if (!existsSync(path.join(repoRoot, notesFile))) {
  throw new Error(`Missing release notes: ${notesFile}`);
}

const args = [
  "release",
  "create",
  tag,
  "--repo",
  "every-app/open-seo",
  "--title",
  tag,
  "--notes-file",
  notesFile,
];

if (values["dry-run"]) {
  process.stdout.write(`gh ${args.join(" ")}\n`);
} else {
  execFileSync("gh", args, { cwd: repoRoot, stdio: "inherit" });
}
