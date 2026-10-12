import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const googleIdentitySchema = z.object({
  sub: z.string().min(1),
  exp: z.number().int(),
  iat: z.number().int(),
});

export async function getGoogleAccountId(idToken: string, clientId: string) {
  const { payload } = await jwtVerify(idToken, googleKeys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
    algorithms: ["RS256"],
  });
  return googleIdentitySchema.parse(payload).sub;
}
