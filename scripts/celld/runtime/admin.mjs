import { readFile } from "node:fs/promises";
const [command, first, second, third] = process.argv.slice(2);
const email = command === "claim-legacy-user" ? second : first;
const name = command === "create-user" ? second : undefined;
const userId = command === "claim-legacy-user" ? first : undefined;
const organizationId = command === "claim-legacy-user" ? third : undefined;
if (
  !["create-user", "reset-password", "claim-legacy-user"].includes(command) ||
  !email ||
  (command === "create-user" && !name)
) {
  console.error(
    "Usage: admin.mjs create-user EMAIL NAME | reset-password EMAIL | claim-legacy-user USER_ID EMAIL ORGANIZATION_ID\nPass the password on standard input.",
  );
  process.exit(1);
}
let input = "";
for await (const chunk of process.stdin) input += chunk;
const password = input.replace(/\r?\n$/, "");
if (password.length < 8 || password.length > 128)
  throw new Error("Password must contain 8–128 characters");
// Inside the Docker runtime container the secret sits in the config volume
// and the app listens on 8080. A Cloudflare self-hoster runs this script from
// the repository (`pnpm selfhost:admin`) with the secret from .env.selfhost
// and the deployed URL in OPENSEO_URL.
const operatorSecret =
  process.env.OPENSEO_OPERATOR_SECRET ||
  JSON.parse(await readFile("/config/secrets.json", "utf8"))
    .OPENSEO_OPERATOR_SECRET;
const baseUrl = process.env.OPENSEO_URL || "http://127.0.0.1:8080";
const response = await fetch(`${baseUrl}/api/standalone/admin`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-openseo-operator-secret": operatorSecret,
  },
  body: JSON.stringify({
    command,
    email,
    name,
    password,
    userId,
    organizationId,
  }),
});
const text = await response.text();
const result = (() => {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
})();
if (!response.ok) {
  console.error(
    result.error ??
      `${response.status} ${text.trim()} — is OPENSEO_OPERATOR_SECRET set on this deployment?`,
  );
  process.exit(1);
}
console.log(`${command} succeeded for ${result.email}`);
