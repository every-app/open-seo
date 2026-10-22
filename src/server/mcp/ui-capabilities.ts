import {
  EXTENSION_ID,
  getUiCapability,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { CLIENT_CAPABILITIES_META_KEY } from "@modelcontextprotocol/server";
import { z } from "zod";

const requestSchema = z.object({
  params: z
    .object({
      _meta: z
        .object({
          [CLIENT_CAPABILITIES_META_KEY]: z
            .object({
              extensions: z
                .object({
                  [EXTENSION_ID]: z
                    .object({ mimeTypes: z.array(z.string()) })
                    .optional(),
                })
                .optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export async function supportsMcpApps(request: Request | undefined) {
  if (!request || request.method !== "POST") return false;
  // Each HTTP request gets a fresh server. Legacy initialize capabilities
  // cannot enable UI on later requests without per-request advertisement.
  const parsed = requestSchema.safeParse(
    await request
      .clone()
      .json()
      .catch(() => null),
  );
  return (
    parsed.success &&
    getUiCapability(
      parsed.data.params?._meta?.[CLIENT_CAPABILITIES_META_KEY],
    )?.mimeTypes?.includes(RESOURCE_MIME_TYPE) === true
  );
}
