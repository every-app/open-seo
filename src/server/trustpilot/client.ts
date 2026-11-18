import { z } from "zod";

// Thin client for the two Trustpilot business APIs we use: email invitations
// and invitation-data deletion. No cloudflare:workers import, so code
// outside the worker can call it with process.env values.
//
// Auth is the client-credentials grant: the token belongs to the API app,
// not a person, so every invitations call names the business user it acts
// for.
// https://developers.trustpilot.com/grant-type-client-credentials
// https://developers.trustpilot.com/invitation-api

export type TrustpilotConfig = {
  apiKey: string;
  apiSecret: string;
  businessUnitId: string;
  /** Required with client-credentials tokens: the business user the
   *  invitations are sent on behalf of. */
  businessUserId: string;
  /** Unset uses the account's default invitation template. */
  templateId?: string;
};

const TOKEN_URL =
  "https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken";
const INVITATIONS_API = "https://invitations-api.trustpilot.com/v1/private";

const tokenSchema = z.object({ access_token: z.string().min(1) });

export async function getTrustpilotAccessToken(config: TrustpilotConfig) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${config.apiKey}:${config.apiSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(
      `Trustpilot token request failed (${response.status}): ${await response.text()}`,
    );
  }
  return tokenSchema.parse(await response.json()).access_token;
}

/**
 * Asks Trustpilot to email a service review invitation at `preferredSendTime`
 * (Trustpilot holds it until then). Sender, reply-to, template default and
 * reminder come from the business app's Invitation settings.
 */
export async function createTrustpilotInvitation(
  config: TrustpilotConfig,
  accessToken: string,
  invitation: {
    email: string;
    name: string;
    referenceNumber: string;
    tags: string[];
    preferredSendTime: Date;
  },
) {
  const response = await fetch(
    `${INVITATIONS_API}/business-units/${encodeURIComponent(config.businessUnitId)}/email-invitations`,
    {
      method: "POST",
      headers: invitationsHeaders(config, accessToken),
      body: JSON.stringify({
        consumerEmail: invitation.email,
        consumerName: invitation.name,
        referenceNumber: invitation.referenceNumber,
        locale: "en-US",
        type: "email",
        serviceReviewInvitation: {
          ...(config.templateId ? { templateId: config.templateId } : {}),
          preferredSendTime: invitation.preferredSendTime.toISOString(),
          tags: invitation.tags,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Trustpilot invitation failed (${response.status}): ${await response.text()}`,
    );
  }
}

/** Deletes everything Trustpilot holds from invitations sent to these
 *  addresses. Irreversible; reviews already written stay up. */
export async function deleteTrustpilotInvitationData(
  config: TrustpilotConfig,
  accessToken: string,
  emails: string[],
) {
  const response = await fetch(
    `${INVITATIONS_API}/business-units/${encodeURIComponent(config.businessUnitId)}/invitation-data/delete`,
    {
      method: "POST",
      headers: invitationsHeaders(config, accessToken),
      body: JSON.stringify({ customerEmails: emails }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Trustpilot invitation data deletion failed (${response.status}): ${await response.text()}`,
    );
  }
}

function invitationsHeaders(config: TrustpilotConfig, accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "x-business-user-id": config.businessUserId,
    "Content-Type": "application/json",
  };
}
