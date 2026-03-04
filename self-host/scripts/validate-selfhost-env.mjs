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

const requiredKeys = [
  "GATEWAY_URL",
  "VITE_GATEWAY_URL",
  "VITE_APP_ID",
  "DATAFORSEO_API_KEY",
  "BETTER_AUTH_SECRET",
  "JWT_PRIVATE_KEY",
  "JWT_PUBLIC_KEY",
];

const missingKeys = requiredKeys.filter((key) => isBlank(env[key]));
if (missingKeys.length > 0) {
  console.error("Missing required keys in env file:");
  for (const key of missingKeys) {
    console.error(`- ${key}`);
  }
  console.error("\nGenerate auth keys with: pnpm run docker:generate-secrets");
  process.exit(1);
}

if (env.GATEWAY_URL !== env.VITE_GATEWAY_URL) {
  console.error(
    "GATEWAY_URL and VITE_GATEWAY_URL must match for auth issuer consistency.",
  );
  process.exit(1);
}

if (!env.JWT_PRIVATE_KEY.includes("BEGIN PRIVATE KEY")) {
  console.error("JWT_PRIVATE_KEY does not look like a PEM private key.");
  process.exit(1);
}

if (!env.JWT_PUBLIC_KEY.includes("BEGIN PUBLIC KEY")) {
  console.error("JWT_PUBLIC_KEY does not look like a PEM public key.");
  process.exit(1);
}

if (env.BETTER_AUTH_SECRET.trim().length < 32) {
  console.error(
    "BETTER_AUTH_SECRET is too short. Generate a new one with docker:generate-secrets.",
  );
  process.exit(1);
}

console.log(`Env validation passed: ${envPath}`);
