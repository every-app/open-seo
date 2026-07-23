import { createServerFn } from "@tanstack/react-start";
import { readFile } from "node:fs/promises";

const PULSE_DIGEST_PATH =
  "/Users/ramai/.openclaw/workspace/memory/seo-pulse-digest.md";
const WAR_ROOM_PATH =
  "/Users/ramai/.openclaw/workspace/clients/seo-warroom.md";

export const getSeoPulseDigest = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const content = await readFile(PULSE_DIGEST_PATH, "utf-8");
      return content;
    } catch {
      return null;
    }
  },
);

export const getSeoWarRoom = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const content = await readFile(WAR_ROOM_PATH, "utf-8");
      return content;
    } catch {
      return null;
    }
  },
);