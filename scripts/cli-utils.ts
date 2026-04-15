import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

export function parseArgs(argv: string[]) {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const withoutPrefix = token.slice(2);
    const sep = withoutPrefix.indexOf("=");
    if (sep >= 0) {
      parsed[withoutPrefix.slice(0, sep)] = withoutPrefix.slice(sep + 1);
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[withoutPrefix] = "true";
      continue;
    }
    parsed[withoutPrefix] = next;
    i += 1;
  }
  return parsed;
}

export function loadLocalEnv() {
  for (const path of [".env.local", ".env"]) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const sep = trimmed.indexOf("=");
      if (sep < 0) continue;
      const key = trimmed.slice(0, sep).trim();
      const rawValue = trimmed.slice(sep + 1).trim();
      if (!key || process.env[key]) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}
