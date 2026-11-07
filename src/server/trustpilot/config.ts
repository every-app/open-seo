import type { TrustpilotConfig } from "./client";

/** The Trustpilot API app from env, or null when it isn't configured. Only
 *  hosted production sets these, so self-hosted installs and previews never
 *  call Trustpilot. Takes the lookup as a parameter so code outside the worker can pass
 *  process.env. */
export async function getTrustpilotConfig(
  lookup: (name: string) => Promise<string | undefined> | string | undefined,
): Promise<TrustpilotConfig | null> {
  const [apiKey, apiSecret, businessUnitId, businessUserId, templateId] =
    await Promise.all(
      [
        "TRUSTPILOT_API_KEY",
        "TRUSTPILOT_API_SECRET",
        "TRUSTPILOT_BUSINESS_UNIT_ID",
        "TRUSTPILOT_BUSINESS_USER_ID",
        "TRUSTPILOT_TEMPLATE_ID",
      ].map(lookup),
    );
  if (!apiKey || !apiSecret || !businessUnitId || !businessUserId) {
    return null;
  }
  return {
    apiKey,
    apiSecret,
    businessUnitId,
    businessUserId,
    templateId: templateId || undefined,
  };
}
