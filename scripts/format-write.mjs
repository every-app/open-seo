#!/usr/bin/env node

// @ts-check

// `pnpm format:write` formats the whole repository; `pnpm format:write <files>`
// formats only the named files. pnpm forwards the extra arguments here, so a
// targeted run no longer surprises everyone else working in the same checkout.

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const files = args.length > 0 ? args : ["."];

const result = spawnSync("prettier", ["--write", ...files], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
