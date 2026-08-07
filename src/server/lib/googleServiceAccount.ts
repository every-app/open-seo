import { readFile } from "node:fs/promises";
import { importPKCS8, SignJWT } from "jose";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

export type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function loadGoogleServiceAccount(): Promise<GoogleServiceAccount | null> {
  // Inline JSON is the only form that works on Workers (no disk); the file
  // path is kept for Node/CLI contexts.
  const inline = await getOptionalEnvValue("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (inline) return parseServiceAccount(inline);

  const path = await getOptionalEnvValue("GOOGLE_APPLICATION_CREDENTIALS");
  if (!path) return null;
  try {
    return parseServiceAccount(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function parseServiceAccount(raw: string): GoogleServiceAccount | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isServiceAccount(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isServiceAccount(value: unknown): value is GoogleServiceAccount {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.client_email === "string" &&
    typeof record.private_key === "string"
  );
}

export async function getGoogleServiceAccountToken(
  scopes: string[],
): Promise<{ token: string } | { setupMessage: string }> {
  const account = await loadGoogleServiceAccount();
  if (!account) {
    return {
      setupMessage:
        "Google credentials are not configured. Set GOOGLE_APPLICATION_CREDENTIALS to the absolute path of a Google service-account JSON file, grant that service account access to the requested property, and try again.",
    };
  }

  try {
    const key = await importPKCS8(account.private_key, "RS256");
    const assertion = await new SignJWT({ scope: scopes.join(" ") })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(account.client_email)
      .setAudience(TOKEN_URL)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 300);
      return {
        setupMessage: `Google service-account authentication failed (${response.status}). Confirm the JSON key is valid and the APIs are enabled. ${body}`,
      };
    }
    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) {
      return {
        setupMessage:
          "Google returned no access token for the service account.",
      };
    }
    return { token: data.access_token };
  } catch (error) {
    return {
      setupMessage: `Google service-account authentication failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export const GOOGLE_SETUP_MESSAGE =
  "Google credentials are not configured. Set GOOGLE_APPLICATION_CREDENTIALS to the absolute path of a Google service-account JSON file, grant that service account access to the requested property, and try again.";
