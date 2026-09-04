import { z } from "zod";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_MAX_URLS = 10_000;
export const INDEXNOW_CHUNK_SIZE = 1_000;
const INDEXNOW_MAX_URL_BYTES = 2_048;
const INDEXNOW_MAX_TOTAL_URL_BYTES = 2 * 1024 * 1024;
export const INDEXNOW_MAX_OUTBOUND_BODY_BYTES = 2_200_000;

const utf8Length = (value: string) =>
  new TextEncoder().encode(value).byteLength;

const indexNowUrlSchema = z
  .string()
  .min(1)
  .max(INDEXNOW_MAX_URL_BYTES, {
    message: `Each IndexNow URL must be at most ${INDEXNOW_MAX_URL_BYTES} characters.`,
  })
  .refine((value) => utf8Length(value) <= INDEXNOW_MAX_URL_BYTES, {
    message: `Each IndexNow URL must be at most ${INDEXNOW_MAX_URL_BYTES} UTF-8 bytes.`,
  });

export const indexNowUrlsSchema = z
  .array(indexNowUrlSchema)
  .min(1)
  .max(INDEXNOW_MAX_URLS)
  .superRefine((values, context) => {
    const totalBytes = values.reduce(
      (total, value) => total + utf8Length(value),
      0,
    );
    if (totalBytes > INDEXNOW_MAX_TOTAL_URL_BYTES) {
      context.addIssue({
        code: "custom",
        message: `IndexNow URL input must be at most ${INDEXNOW_MAX_TOTAL_URL_BYTES} UTF-8 bytes in total.`,
      });
    }
  });

export const indexNowProjectSchema = z.strictObject({
  projectId: z.string().min(1),
});

export const configureIndexNowSchema = indexNowProjectSchema.extend({
  keyLocation: z.string().url().max(INDEXNOW_MAX_URL_BYTES).optional(),
});

export const submitIndexNowSchema = indexNowProjectSchema.extend({
  urls: indexNowUrlsSchema,
  confirmed: z.literal(true),
});

export type IndexNowChunkReceipt = {
  chunkIndex: number;
  urlCount: number;
  status: "received" | "rejected" | "failed";
  httpStatus: number | null;
};
