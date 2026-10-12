import { z } from "zod";
import {
  MAX_SIGNATURE_VALUE_LENGTH,
  isCrawlerAccessExpired,
  normalizeCrawlerHost,
  parseSignatureExpiry,
} from "@/shared/crawler-access";

const hostSchema = z.string().transform((value, ctx) => {
  const host = normalizeCrawlerHost(value);
  if (!host) {
    ctx.addIssue({
      code: "custom",
      message: "Enter a domain like store.example.com",
    });
    return z.NEVER;
  }
  return host;
});

// These values are replayed verbatim as HTTP headers. Anything outside
// printable ASCII (a smart quote from a rich-text paste, a CR/LF) would either
// inject a header or make every crawler fetch throw, silently emptying the
// audit — so reject it here where the user can fix it.
const signatureValueSchema = z
  .string()
  .trim()
  .min(1, "Paste the value from Shopify admin")
  .max(MAX_SIGNATURE_VALUE_LENGTH)
  .refine(
    (value) => /^[\x20-\x7e]+$/.test(value),
    "This value contains characters that can't go in an HTTP header",
  );

export const saveCrawlerCredentialSchema = z.object({
  projectId: z.string().min(1),
  host: hostSchema,
  signatureInput: signatureValueSchema.refine(
    (value) => !isCrawlerAccessExpired(parseSignatureExpiry(value)),
    "This signature has already expired. Create a new one in Shopify admin.",
  ),
  signature: signatureValueSchema,
});

export const deleteCrawlerCredentialSchema = z.object({
  id: z.string().min(1),
});
