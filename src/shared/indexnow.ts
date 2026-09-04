import { z } from "zod";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_MAX_URLS = 10_000;
export const INDEXNOW_CHUNK_SIZE = 1_000;

export const indexNowProjectSchema = z.strictObject({
  projectId: z.string().min(1),
});

export const configureIndexNowSchema = indexNowProjectSchema.extend({
  keyLocation: z.string().url().optional(),
});

export const submitIndexNowSchema = indexNowProjectSchema.extend({
  urls: z.array(z.string().min(1)).min(1).max(INDEXNOW_MAX_URLS),
  confirmed: z.literal(true),
});

export type IndexNowChunkReceipt = {
  chunkIndex: number;
  urlCount: number;
  status: "received" | "rejected" | "failed";
  httpStatus: number | null;
};
