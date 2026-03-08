import { existsSync, readFileSync } from "node:fs";

function parseEnvFile(path) {
  const raw = readFileSync(path, "utf8");
  const out = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value.replace(/\\n/g, "\n");
  }

  return out;
}

function isBlank(value) {
  return typeof value !== "string" || value.trim().length === 0;
}

const envPath = process.argv[2] || ".env.local";

if (!existsSync(envPath)) {
  console.error(`Missing env file: ${envPath}`);
  console.error("Create it with: cp .env.example .env.local");
  process.exit(1);
}

const env = parseEnvFile(envPath);

const requiredKeys = ["DATAFORSEO_API_KEY"];

const missingKeys = requiredKeys.filter((key) => isBlank(env[key]));
if (missingKeys.length > 0) {
  console.error("Missing required keys in env file:");
  for (const key of missingKeys) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

if (isBlank(env.BYPASS_GATEWAY_LOCAL_ONLY)) {
  console.warn(
    "Warning: BYPASS_GATEWAY_LOCAL_ONLY is not set in .env.local. Docker sets it automatically.",
  );
}

console.log(`Env validation passed: ${envPath}`);
